import os
"""Verify PDS XYZ vs labelled CAHV cameras in the documented site coordinate frame."""
from pathlib import Path
import re,json,hashlib,warnings
import numpy as np,rasterio
warnings.filterwarnings('ignore',category=rasterio.errors.NotGeoreferencedWarning)
ROOT=Path(os.environ.get('MARS_BEACON_DATA','Mars_BEACON_Datasets')+'/04_Rover_Stereo_And_Gaussian_Splatting');OUT=Path(__file__).resolve().parents[1]/'data/rover_geometry';OUT.mkdir(exist_ok=True)
def group(s,name):return re.search(r'GROUP\s*=\s*'+name+r'\b(.*?)END_GROUP',s,re.S)[1]
def vector(s,key):return np.array([float(x) for x in re.search(r'(?<!\w)'+key+r'\s*=\s*\((.*?)\)',s,re.S)[1].replace('\n','').split(',')])
def rotation(q):
 w,x,y,z=q/np.linalg.norm(q);return np.array([[1-2*(y*y+z*z),2*(x*y-z*w),2*(x*z+y*w)],[2*(x*y+z*w),1-2*(x*x+z*z),2*(y*z-x*w)],[2*(x*z-y*w),2*(y*z+x*w),1-2*(x*x+y*y)]])
reports=[]
for f in sorted(ROOT.rglob('*XYZ*.IMG')):
 s=f.with_suffix('.LBL').read_text();camera=group(s,'GEOMETRIC_CAMERA_MODEL_PARMS');rover=group(s,'ROVER_COORD_SYSTEM_PARMS');derived=group(s,'DERIVED_IMAGE_PARMS')
 assert re.search(r'MODEL_TYPE\s*=\s*CAHV\b',camera);assert 'ROVER_NAV_FRAME' in camera and 'SITE_FRAME' in derived
 C,A,H,V=[vector(camera,f'MODEL_COMPONENT_{i}') for i in range(1,5)];R=rotation(vector(rover,'ORIGIN_ROTATION_QUATERNION'));T=vector(rover,'ORIGIN_OFFSET_VECTOR');C=R@C+T;A=R@A;H=R@H;V=R@V
 with rasterio.open(f) as d: xyz=d.read().transpose(1,2,0).astype(float)
 yy,xx=np.indices(xyz.shape[:2]);valid=np.isfinite(xyz).all(2)&np.any(xyz!=0,axis=2);p=xyz[valid];delta=p-C;denom=delta@A;front=denom>0;p=p[front];delta=delta[front];denom=denom[front];u=delta@H/denom;v=delta@V/denom
 if len(p)==0:
  reports.append({'product':f.name,'valid_points':0,'frame_check_passed':False,'reason':'no finite nonzero points in front of camera'});continue
 # XYZ products retain image grid dimensions; direct point-to-pixel reprojection
 # checks camera direction, quaternion order, transform direction and frame origin.
 du=u-xx[valid][front];dv=v-yy[valid][front];err=np.sqrt(du*du+dv*dv);distance=np.linalg.norm(p-C,axis=1);near=distance<40
 report={'product':f.name,'source_sha256':hashlib.sha256(f.read_bytes()).hexdigest(),'site':int(re.search(r'REFERENCE_COORD_SYSTEM_INDEX\s*=\s*(\d+)',derived)[1]),'valid_points':len(err),'near_40m_points':int(near.sum()),'pixel_error_median':float(np.median(err)),'pixel_error_p95':float(np.quantile(err,.95)),'median_signed_pixel_offset':[float(np.median(du)),float(np.median(dv))],'camera_center_site_m':C.tolist(),'frame_check_passed':bool(np.quantile(err,.95)<1.)}
 reports.append(report)
 if report['frame_check_passed']:
  # Retain measured site-frame XYZ rather than asserting orbital registration.
  pts=p[near][::4].astype('f4');np.savez_compressed(OUT/(f.stem+'.npz'),points_site=pts,camera_center=C,site=report['site'])
(OUT/'reprojection_audit.json').write_text(json.dumps(reports,indent=2));print(json.dumps({'products':len(reports),'passed':sum(x['frame_check_passed'] for x in reports),'examples':reports[:2]},indent=2))
