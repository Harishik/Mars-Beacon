import json,hashlib,sys
from pathlib import Path
import numpy as np
from environment_fields import *
root=Path(sys.argv[1]);out=Path(sys.argv[2]);out.mkdir(parents=True,exist_ok=True)
raw=root/'terrain.npz';before=hashlib.sha256(raw.read_bytes()).hexdigest();d=np.load(raw);h=d['vertices'][:,2].reshape(d['shape']);n=terrain_normals(h);horizon=local_horizon(h)
# 48 temporal keys with explicit scenario values. No altitude correction because tau
# below is defined at the local surface; avoid applying pressure correction twice.
times=np.arange(48)/2;ls=255.;tau=float(seasonal_tau(ls));solar=np.stack([direct_irradiance(n,sun_enu(-4.86,ls,t),tau,ls,local_solar_visibility(horizon,sun_enu(-4.86,ls,t))) for t in times]).astype('f4')
np.savez_compressed(out/'environment_fields.npz',ltst_hours=times,irradiance_direct_w_m2=solar,normals_enu=n.astype('f4'),tau_surface=np.float32(tau),local_horizon_rad=horizon.astype('f4'))
# Channels: direct solar, dust optical depth, slope, validity; reserve thermal until calibrated.
slope=np.rad2deg(np.arccos(n[...,2]));packed=np.zeros((*solar.shape,4),dtype='<f2');packed[...,0]=solar;packed[...,1]=tau;packed[...,2]=slope;packed[...,3]=1;packed.tofile(out/'environment_rgba16f.bin')
after=hashlib.sha256(raw.read_bytes()).hexdigest();assert before==after
meta={'status':'scenario prototype, not calibrated Mars forecast','terrain_sha256':before,'bedrock_unchanged':True,'time':{'kind':'LTST','hours':times.tolist(),'Ls_deg':ls,'dated_ephemeris':False},'grid':{'rows':int(h.shape[0]),'cols':int(h.shape[1]),'row_direction':'south','pixel_m':1},'channels':['direct_irradiance_W_m-2','surface_dust_optical_depth','slope_degrees','validity'],'layout':'[time,row,col,channel] little-endian float16, C order','temperature':None,'radiation_dose':None,'rover_trafficability':None,'limitations':['solar approximation, no dated Mars24 ephemeris','local horizon: 32 azimuths to 64 m; terrain outside tile/range unknown','direct-only grey attenuation; no diffuse or longwave energy','dust seasonal parameters illustrative, not fitted','thermal inertia and wheel-soil parameters not calibrated'],'float16_max_solar_roundtrip_error_w_m2':float(np.max(np.abs(packed[...,0].astype('f4')-solar)))};(out/'field_manifest.json').write_text(json.dumps(meta,indent=2));print(json.dumps(meta,indent=2))
