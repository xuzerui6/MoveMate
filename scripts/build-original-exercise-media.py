"""Offline publication of explicitly reviewed original SVGs rendered as PNG.
Run render-exercise-illustrations.mjs first; --renders contains browser renders
of those sources. The renderer never fetches or transforms third-party media.
"""
import argparse,hashlib,json,pathlib
from PIL import Image

ROOT=pathlib.Path(__file__).resolve().parent.parent
parser=argparse.ArgumentParser();parser.add_argument('--renders',required=True)
args=parser.parse_args();renders=pathlib.Path(args.renders)
render_manifest=json.loads((renders/'render-manifest.json').read_text(encoding='utf8'))
rendered={r['svg']:r for r in render_manifest['renders']}
config=json.loads((ROOT/'scripts/exercise-illustrations.json').read_text(encoding='utf8'))
manifest=json.loads((ROOT/'client/src/features/gym/exercise-media.json').read_text(encoding='utf8'))
public=ROOT/'client/public/exercise-media'
sha=lambda b:hashlib.sha256(b).hexdigest()
for eid,row in config['entries'].items():
    previous=manifest['entries'].get(eid)
    if previous and previous.get('kind')!='illustration':raise ValueError('Cannot overwrite reviewed photographs: '+eid)
    images=[];hashes=[]
    for n,phase in enumerate(row['phases']):
        stem=eid.replace(':','-')+'-'+str(n)
        svg=(ROOT/'assets/exercise-illustrations'/f'{stem}.svg').read_bytes();hashes.append(sha(svg))
        proof=rendered[f'{stem}.svg']
        if proof['sourceSha256']!=sha(svg) or proof['sha256']!=sha((renders/f'{stem}.png').read_bytes()):raise ValueError('Stale or modified original render: '+stem)
        image=Image.open(renders/f'{stem}.png').convert('RGB')
        if image.size!=(600,600):raise ValueError('Unexpected original render size')
        import io
        output=io.BytesIO();image.save(output,'WEBP',quality=90,method=6)
        data=output.getvalue();h=sha(data);name=f'original-{stem}.{h[:12]}.webp';(public/name).write_bytes(data)
        images.append({'src':'/exercise-media/'+name,'bytes':len(data),'sha256':h,'phase':phase,'sourceIndex':0,'distribution':'repository'})
    manifest['entries'][eid]={'kind':'illustration','note':row['form']+' 原创静态三阶段示意，不是连续视频。','images':images,'sources':[{'name':'MoveMate 原创人体动作示意 / '+eid,'author':'MoveMate contributors','license':'MIT','licenseUrl':'/exercise-media/ORIGINAL-MIT.txt','url':'https://github.com/xuzerui6/MoveMate/tree/main/assets/exercise-illustrations','version':'original-1','sourceSha256':hashes,'changes':'按显式关节、器械及支撑配置绘制 SVG，浏览器渲染为 600×600，再等比例编码为 WebP；中性线条人物，不代表真人或族裔。','distribution':'repository'}]}
(public/'ORIGINAL-MIT.txt').write_bytes((ROOT/'assets/exercise-illustrations/LICENSE.txt').read_bytes())
for f in [ROOT/'client/src/features/gym/exercise-media.json',public/'attribution.json']:
    f.write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
print('Published original diagrams:',len(config['entries']))
