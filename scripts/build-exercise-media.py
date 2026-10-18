"""Build ONLY reviewed media. Developer-only: Python/Pillow + imageio-ffmpeg.
Usage: python scripts/build-exercise-media.py --staging /outside/repo/staging
Staging contains candidates/<sourceId>-0.jpg,-1.jpg and wger-<id>.mov,
plus the two verbatim licence files. No discovery or fuzzy matching here.
"""
import argparse, hashlib, json, pathlib, subprocess
from PIL import Image, ImageOps
import imageio_ffmpeg

ROOT=pathlib.Path(__file__).resolve().parent.parent
args=argparse.ArgumentParser();args.add_argument('--staging',required=True)
stage=pathlib.Path(args.parse_args().staging)
approved=json.loads((ROOT/'scripts/exercise-media-approved.json').read_text(encoding='utf8'))
dest=ROOT/'client/public/exercise-media';dest.mkdir(parents=True,exist_ok=True)
entries={};ff=imageio_ffmpeg.get_ffmpeg_exe()
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def asset(p,name,ext):
 h=sha(p);filename=f'{name}.{h[:12]}.{ext}';target=dest/filename
 target.write_bytes(p.read_bytes());return {'src':'/exercise-media/'+filename,'sha256':h,'bytes':target.stat().st_size}
def photo(p,name):
 im=ImageOps.exif_transpose(Image.open(p)).convert('RGB');im.thumbnail((960,960))
 output=stage/(name+'.webp');im.save(output,'WEBP',quality=84,method=6)
 return asset(output,name,'webp')
for row in approved['stills']:
 id=row['exerciseId'];source=row['sourceId'];images=[]
 for i,expected in enumerate(row['sourceSha256']):
  p=stage/'candidates'/f'{source}-{i}.jpg'
  assert sha(p)==expected,f'Unreviewed source bytes: {p}'
  images.append({**photo(p,source.lower()+f'-{i}'),'phase':f'分解 {i+1}'})
 entries[id]={'note':'实拍双帧分解，按顺序查看；不是连续动画。','images':images,'sources':[{
  'name':'free-exercise-db / '+source,'author':'free-exercise-db contributors（原图未单独署名）',
  'license':'Unlicense','licenseUrl':'/exercise-media/UNLICENSE.txt',
  'url':f'https://github.com/yuhonas/free-exercise-db/tree/{approved["freeVersion"]}/exercises/{source}',
  'version':approved['freeVersion'],'sourceSha256':row['sourceSha256'],
  'changes':'按原比例缩小并转为 WebP；未裁切、未生成或改绘人物。',
 }]}
for row in approved['videos']:
 v=row['source'];id=v['id'];p=stage/'candidates'/f'wger-{id}.mov'
 assert v['license']==2 and v['license_author'] and sha(p)==v['sourceSha256']
 output=stage/f'approved-wger-{id}.mp4';poster=stage/f'approved-wger-{id}.png'
 subprocess.run([ff,'-v','error','-ss',str(row['start']),'-i',str(p),'-t',str(row['end']-row['start']),'-an','-vf','scale=trunc(iw*min(1\\,720/ih)/2)*2:trunc(ih*min(1\\,720/ih)/2)*2','-c:v','libx264','-preset','fast','-crf','25','-pix_fmt','yuv420p','-movflags','+faststart','-y',str(output)],check=True)
 subprocess.run([ff,'-v','error','-ss','0.1','-i',str(output),'-frames:v','1','-y',str(poster)],check=True)
 poster_file=photo(poster,f'wger-{id}-poster')
 video={**asset(output,f'wger-{id}','mp4'),'poster':poster_file['src'],'posterSha256':poster_file['sha256'],'aspectRatio':Image.open(poster).width/Image.open(poster).height}
 source={'name':f'wger / video {id}','author':v['license_author'],'license':'CC BY-SA 4.0','licenseUrl':'https://creativecommons.org/licenses/by-sa/4.0/','url':v['video'],'version':f'video:{id}; retrieved {approved["reviewedAt"]}; sha256:{v["sourceSha256"]}', 'sourceSha256':[v['sourceSha256']],'changes':f'仅保留原片 {row["start"]}–{row["end"]} 秒，去掉音轨，按原比例转为 H.264/MP4，提取封面；无空间裁切。衍生视频及封面沿用 CC BY-SA 4.0。'}
 for eid in row['exerciseIds']:
  assert eid in entries
  entries[eid]['video']=video;entries[eid]['sources'].append(source)
  entries[eid]['note']={6:'站姿双臂侧平举，抬至肩高后缓慢放回。',12:'坐姿双臂肩推，保持躯干稳定，控制回落。',17:'平板凳双哑铃卧推，控制下降，避免哑铃相撞。',71:'正握引体向上，控制上拉与下放，不用摆动借力。'}[id]+'实拍示范用于理解动作过程，负重按自身能力选择。'
manifest={'version':1,'reviewedAt':approved['reviewedAt'],'entries':entries}
for p in [ROOT/'client/src/features/gym/exercise-media.json',dest/'attribution.json']:
 p.write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
(ROOT/'cloudflare/src/media-sizes.json').write_text(json.dumps({m['video']['src']:m['video']['bytes'] for m in entries.values() if 'video' in m},indent=2)+'\n',encoding='utf8')
for source,name in [('free-license-pinned.txt','UNLICENSE.txt'),('CC-BY-SA-4.0.txt','CC-BY-SA-4.0.txt')]:
 (dest/name).write_text((stage/source).read_text(encoding='utf8').rstrip()+'\n',encoding='utf8')
print('Published',len(entries),'image entries;',sum('video' in e for e in entries.values()),'video entries')
