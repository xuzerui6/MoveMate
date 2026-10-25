"""Build ONLY reviewed media. Developer-only: Python/Pillow + imageio-ffmpeg.
Usage: python scripts/build-exercise-media.py --staging /outside/repo/staging
Staging contains candidates/<sourceId>-0.jpg,-1.jpg and wger-<id>.mov,
plus the two verbatim licence files. No discovery or fuzzy matching here.
"""
import argparse, hashlib, json, pathlib, subprocess, os
from PIL import Image, ImageOps
import imageio_ffmpeg

ROOT=pathlib.Path(__file__).resolve().parent.parent
args=argparse.ArgumentParser();args.add_argument('--staging',required=True);args.add_argument('--only',help='Comma-separated reviewed exercise IDs; preserve all other published entries byte-for-byte')
options=args.parse_args();stage=pathlib.Path(options.staging)
only=set(options.only.split(',')) if options.only else None
approved=json.loads((ROOT/'scripts/exercise-media-approved.json').read_text(encoding='utf8'))
known={r['exerciseId'] for r in approved['stills']}|{eid for r in approved['videos']+approved.get('siteVideos',[]) for eid in r['exerciseIds']}
assert not only or only<=known, 'Unknown or unreviewed --only exercise IDs'
dest=ROOT/'client/public/exercise-media';dest.mkdir(parents=True,exist_ok=True)
local_config=ROOT/'server/data/media-config.json'
media_dir=os.environ.get('MOVEMATE_MEDIA_DIR') or (json.loads(local_config.read_text(encoding='utf8')).get('MOVEMATE_MEDIA_DIR') if local_config.exists() else None)
site_dest=pathlib.Path(media_dir)/'exercise-media' if media_dir else None
if site_dest:
 assert ROOT not in site_dest.resolve().parents, 'Site-only media must stay outside Git'
 site_dest.mkdir(parents=True,exist_ok=True)
entries=json.loads((ROOT/'client/src/features/gym/exercise-media.json').read_text(encoding='utf8'))['entries'] if only else {}
ff=imageio_ffmpeg.get_ffmpeg_exe()
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def asset(p,name,ext,distribution='repository'):
 assert distribution in ['repository','site-only']
 assert distribution!='site-only' or site_dest, 'Set MOVEMATE_MEDIA_DIR for reviewed site-only assets'
 h=sha(p);filename=f'{name}.{h[:12]}.{ext}';target=(site_dest if distribution=='site-only' else dest)/filename
 target.write_bytes(p.read_bytes());return {'src':'/exercise-media/'+filename,'sha256':h,'bytes':target.stat().st_size,'distribution':distribution}
def photo(p,name,distribution='repository'):
 im=ImageOps.exif_transpose(Image.open(p)).convert('RGB');im.thumbnail((960,960))
 output=stage/(name+'.webp');im.save(output,'WEBP',quality=84,method=6)
 return asset(output,name,'webp',distribution)
for row in approved['stills']:
 if only and row['exerciseId'] not in only:continue
 if only and row['exerciseId'] in entries:continue
 id=row['exerciseId'];source=row['sourceId'];images=[]
 for i,expected in enumerate(row['sourceSha256']):
  p=stage/'candidates'/f'{source}-{i}.jpg'
  assert sha(p)==expected,f'Unreviewed source bytes: {p}'
  images.append({**photo(p,source.lower()+f'-{i}'),'phase':row.get('phases',[f'分解 {n+1}' for n in range(len(row['sourceSha256']))])[i],'sourceIndex':0})
 entries[id]={'note':row.get('note','实拍双帧分解，按顺序查看；不是连续动画。'),'images':images,'sources':[{
  'name':'free-exercise-db / '+source,'author':'free-exercise-db contributors（原图未单独署名）',
  'license':'Unlicense','licenseUrl':'/exercise-media/UNLICENSE.txt',
  'url':f'https://github.com/yuhonas/free-exercise-db/tree/{approved["freeVersion"]}/exercises/{source}',
  'version':approved['freeVersion'],'sourceSha256':row['sourceSha256'],
  'changes':'按原比例缩小并转为 WebP；未裁切、未生成或改绘人物。',
 'distribution':'repository',
 }]}
for row in approved['videos']:
 if only and not only.intersection(row['exerciseIds']):continue
 v=row['source'];id=v['id'];p=stage/'candidates'/v.get('sourceFile',f'wger-{id}.mov')
 assert v['license']==2 and v['license_author'] and sha(p)==v['sourceSha256']
 output=stage/f'approved-wger-{id}.mp4';poster=stage/f'approved-wger-{id}.png'
 subprocess.run([ff,'-v','error','-ss',str(row['start']),'-i',str(p),'-t',str(row['end']-row['start']),'-an','-vf','scale=trunc(iw*min(1\\,720/ih)/2)*2:trunc(ih*min(1\\,720/ih)/2)*2','-c:v','libx264','-preset','fast','-crf','25','-pix_fmt','yuv420p','-movflags','+faststart','-y',str(output)],check=True)
 subprocess.run([ff,'-v','error','-ss','0.1','-i',str(output),'-frames:v','1','-y',str(poster)],check=True)
 poster_file=photo(poster,f'wger-{id}-poster')
 video={**asset(output,f'wger-{id}','mp4'),'poster':poster_file['src'],'posterSha256':poster_file['sha256'],'aspectRatio':Image.open(poster).width/Image.open(poster).height}
 source={'name':f'wger / video {id}','author':v['license_author'],'license':'CC BY-SA 4.0','licenseUrl':'https://creativecommons.org/licenses/by-sa/4.0/','url':v['video'],'version':f'video:{id}; retrieved {approved["reviewedAt"]}; sha256:{v["sourceSha256"]}', 'sourceSha256':[v['sourceSha256']],'changes':f'仅保留原片 {row["start"]}–{row["end"]} 秒，去掉音轨，按原比例转为 H.264/MP4，提取封面及按原片时间标注的分解帧；无空间裁切。衍生视频、封面及分解帧沿用 CC BY-SA 4.0。'}
 frames=[]
 for i,f in enumerate(row.get('frames',[])):
  assert row['start'] <= f['time'] < row['end'], 'Frame outside reviewed clip'
  frame=stage/f'wger-{id}-phase-{i}.png'
  subprocess.run([ff,'-v','error','-ss',str(f['time']),'-i',str(p),'-frames:v','1','-y',str(frame)],check=True)
  frames.append({**photo(frame,f'wger-{id}-phase-{i}'),'phase':f['phase'],'sourceTime':f['time']})
 for eid in row['exerciseIds']:
  if only and eid not in only:continue
  if eid not in entries:entries[eid]={'images':[],'sources':[]}
  entries[eid]['video']=video;entries[eid]['sources'].append(source)
  if frames:
   entries[eid]['images']=[{**f,'sourceIndex':len(entries[eid]['sources'])-1} for f in frames]
  entries[eid]['note']=row['note']+'实拍示范用于理解动作过程，负重按自身能力选择。'
for row in approved.get('siteVideos',[]):
 if only and not only.intersection(row['exerciseIds']):continue
 p=stage/'candidates'/row['sourceFile'];source=row['source'];key=row['key']
 assert source['license']=='Pexels License' and source['distribution']=='site-only'
 assert sha(p)==source['sourceSha256'][0], 'Unreviewed site-only video'
 output=stage/(key+'.mp4');poster=stage/(key+'-poster.png')
 subprocess.run([ff,'-v','error','-ss',str(row['start']),'-i',str(p),'-t',str(row['end']-row['start']),'-an','-vf','scale=trunc(iw*min(1\\,720/ih)/2)*2:trunc(ih*min(1\\,720/ih)/2)*2','-c:v','libx264','-preset','fast','-crf','25','-pix_fmt','yuv420p','-movflags','+faststart','-y',str(output)],check=True)
 subprocess.run([ff,'-v','error','-ss','0.1','-i',str(output),'-frames:v','1','-y',str(poster)],check=True)
 poster_file=photo(poster,key+'-poster','site-only')
 video={**asset(output,key,'mp4','site-only'),'poster':poster_file['src'],'posterSha256':poster_file['sha256'],'aspectRatio':Image.open(poster).width/Image.open(poster).height}
 frames=[]
 for i,f in enumerate(row['frames']):
  assert row['start']<=f['time']<row['end']
  frame=stage/f'{key}-phase-{i}.png';subprocess.run([ff,'-v','error','-ss',str(f['time']),'-i',str(p),'-frames:v','1','-y',str(frame)],check=True)
  frames.append({**photo(frame,f'{key}-phase-{i}','site-only'),'phase':f['phase'],'sourceTime':f['time'],'sourceIndex':0})
 for eid in row['exerciseIds']:
  if only and eid not in only:continue
  if eid in entries:
   if 'video' in entries[eid]:
    assert row.get('attachToExisting') and entries[eid]['video']==video and source in entries[eid]['sources'], 'Cannot replace a different reviewed video'
    continue
   assert row.get('attachToExisting'), 'Existing reviewed media requires an explicit video attachment'
   entry=entries[eid];index=len(entry['sources']);entry['sources'].append(source)
   entry['images']=[{**f,'sourceIndex':index} for f in frames]+entry['images'];entry['video']=video;entry['note']=row['note']+' 原有已审核分解图继续保留。'
  else:entries[eid]={'note':row['note'],'images':frames,'video':video,'sources':[source]}
manifest={'version':3,'reviewedAt':approved['reviewedAt'],'entries':entries}
for p in [ROOT/'client/src/features/gym/exercise-media.json',dest/'attribution.json']:
 p.write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
(ROOT/'cloudflare/src/media-sizes.json').write_text(json.dumps({m['video']['src']:m['video']['bytes'] for m in entries.values() if 'video' in m},indent=2)+'\n',encoding='utf8')
for source,name in [('free-license-pinned.txt','UNLICENSE.txt'),('CC-BY-SA-4.0.txt','CC-BY-SA-4.0.txt')]:
 (dest/name).write_text((stage/source).read_text(encoding='utf8').rstrip()+'\n',encoding='utf8')
print('Published',len(entries),'image entries;',sum('video' in e for e in entries.values()),'video entries')
