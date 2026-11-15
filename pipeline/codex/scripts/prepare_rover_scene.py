import os
"""Prepare measured CAHV/XYZ training scene in site-local ENU; no orbital registration."""
from pathlib import Path
import re,json,hashlib,warnings
import numpy as np,rasterio
from PIL import Image
warnings.filterwarnings('ignore',category=rasterio.errors.NotGeoreferencedWarning)
ROOT=Path(os.environ.get('MARS_BEACON_DATA','Mars_BEACON_Datasets')+'/04_Rover_Stereo_And_Gaussian_Splatting/altadena');OUT=Path(__file__).resolve().parents[1]/'data/altadena_rover';OUT.mkdir(exist_ok=True);(OUT/'images').mkdir(exist_ok=True)
def group(s,name):return re.search(r'GROUP\s*=\s*'+name+r'\b(.*?)END_GROUP',s,re.S)[1]
def vec(s,key):return np.array([float(x) for x in re.search(r'(?<!\w)'+key+r'\s*=\s*\((.*?)\)',s,re.S)[1].replace('\n','').split(',')])
def rot(q):
 w,x,y,z=q/np.linalg.norm(q);return np.array([[1-2*(y*y+z*z),2*(x*y-z*w),2*(x*z+y*w)],[2*(x*y+z*w),1-2*(x*x+z*z),2*(y*z-x*w)],[2*(x*z-y*w),2*(y*z+x*w),1-2*(x*x+y*y)]])
S=np.array([[0,1,0],[1,0,0],[0,0,-1.]]) # site NED -> local ENU
clouds=[]
for p in (OUT.parent/'rover_geometry').glob('*LS116*.npz'):clouds.append(np.load(p)['points_site'])
points=np.concatenate(clouds)@S.T;origin=np.median(points,axis=0);points-=origin
# Voxel-centre deduplication, retaining measured points (not fabricated centroids).
_,idx=np.unique(np.floor(points/.15).astype(int),axis=0,return_index=True);points=points[np.sort(idx)];rng=np.random.default_rng(42)
if len(points)>80000:points=points[rng.choice(len(points),80000,replace=False)]
np.savez(OUT/'seeds.npz',points=points.astype('f4'),colors=np.full((len(points),3),128,dtype='u1'))
frames=[];sources=[]
for p in sorted(ROOT.rglob('*RAS*.IMG')):
 s=p.with_suffix('.LBL').read_text();c=group(s,'GEOMETRIC_CAMERA_MODEL_PARMS');r=group(s,'ROVER_COORD_SYSTEM_PARMS')
 if not re.search(r'MODEL_TYPE\s*=\s*CAHV\b',c):continue
 C,A,H,V=[vec(c,f'MODEL_COMPONENT_{i}') for i in range(1,5)];R=rot(vec(r,'ORIGIN_ROTATION_QUATERNION'));T=vec(r,'ORIGIN_OFFSET_VECTOR');C=S@(R@C+T)-origin;A=S@R@A;H=S@R@H;V=S@R@V
 A/=np.linalg.norm(A);cx=H@A;cy=V@A;right=H-cx*A;fx=np.linalg.norm(right);right/=fx;down=V-cy*A;fy=np.linalg.norm(down);down/=fy;skew=float(right@down)
 if abs(skew)>1e-4:raise ValueError('CAHV skew requires image rectification')
 with rasterio.open(p) as src:image=src.read(1);height,width=image.shape
 # RAS is radiometrically calibrated. Fixed common radiance display transfer, no
 # per-image histogram scaling. Preserve invalid pixels using a mask.
 image=np.maximum(image.astype(float),0);display=np.clip(image/4095.,0,1)**(1/2.2);u8=(display*255).astype('u1');W=512;Hh=round(height*W/width);name='images/'+p.stem+'.png';Image.fromarray(u8).convert('RGB').resize((W,Hh),Image.Resampling.LANCZOS).save(OUT/name)
 t=np.eye(4);t[:3,:3]=np.stack([right,-down,-A],1);t[:3,3]=C;assert np.allclose(t[:3,:3].T@t[:3,:3],np.eye(3),atol=1e-4)
 scale=W/width;drive=int(vec(r,'COORDINATE_SYSTEM_INDEX')[1]);frames.append({'file_path':name,'transform_matrix':t.tolist(),'fl_x':fx*scale,'fl_y':fy*scale,'cx':cx*scale,'cy':cy*scale,'w':W,'h':Hh,'drive':drive,'product':p.name})
 sources.append({'product':p.name,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()})
# Common crop shape/intrinsics are not assumed. Trainer must consume per-frame K.
train=[];val=[];test=[]
# Both eyes for a mast pointing share the same clock; hold out both together.
clock_groups=sorted(set(f['product'][4:13] for f in frames if f['drive']==1944));vg=set(clock_groups[::6])
for f in frames:
 key='test' if f['drive']!=1944 else ('val' if f['product'][4:13] in vg else 'train')
 {'train':train,'val':val,'test':test}[key].append(f['file_path'])
m={'camera_model':'OPENCV','frames':frames,'train_filenames':train,'val_filenames':val,'test_filenames':test,'scope':'real RAS images, XYZ seeds in site 116 ENU; no orbital tie','site_origin_enu_m':origin.tolist(),'tone_transfer':'common (max(RAS,0)/4095)^(1/2.2), clipped; visualization transfer, not calibrated reflectance','xyz_seed_prior':'measured XYZ from drive1944 only; no image test frames used for colour training','sources':sources,'splits':{'train':len(train),'val':len(val),'test':len(test)},'max_seed_points':len(points)}
(OUT/'transforms.json').write_text(json.dumps(m,indent=2));print(json.dumps({k:m[k] for k in ['scope','splits','max_seed_points','site_origin_enu_m']},indent=2));print('Image shapes',sorted(set((f['w'],f['h']) for f in frames)))
