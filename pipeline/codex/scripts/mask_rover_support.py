from pathlib import Path
import json,numpy as np
from scipy.spatial import ConvexHull
from PIL import Image,ImageDraw
root=Path(__file__).resolve().parents[1]/'data/altadena_rover';m=json.loads((root/'transforms.json').read_text());pts=np.load(root/'seeds.npz')['points'];(root/'masks').mkdir(exist_ok=True);report=[]
for f in m['frames']:
 t=np.array(f['transform_matrix']);pc=(pts-t[:3,3])@t[:3,:3];ok=pc[:,2]<-.1;pc=pc[ok];u=f['fl_x']*pc[:,0]/-pc[:,2]+f['cx'];v=f['cy']-f['fl_y']*pc[:,1]/-pc[:,2];valid=(u>=0)&(u<f['w'])&(v>=0)&(v<f['h']);uv=np.stack([u[valid],v[valid]],1);im=Image.new('L',(f['w'],f['h']))
 if len(uv)>10:
  hull=ConvexHull(uv);ImageDraw.Draw(im).polygon([tuple(x) for x in uv[hull.vertices]],fill=255)
 name='masks/'+Path(f['file_path']).name;im.save(root/name);f['mask_path']=name;f['support_fraction']=float(np.asarray(im).mean()/255);report.append({'frame':f['file_path'],'support_fraction':f['support_fraction'],'drive':f['drive']})
# Keep all split records. Unscorable views remain explicit rather than disappearing.
(root/'transforms.json').write_text(json.dumps(m,indent=2));(root/'support_audit.json').write_text(json.dumps(report,indent=2));print({split:{'all':len(m[split+'_filenames']),'support_gt_1percent':sum(f['file_path'] in m[split+'_filenames'] and f['support_fraction']>.01 for f in m['frames'])} for split in ['train','val','test']})
