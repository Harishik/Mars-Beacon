"""Distance to source DEM; diagnostic of distillation, not independent ground truth."""
import argparse,json
from pathlib import Path
import numpy as np
from scipy.spatial import cKDTree
from plyfile import PlyData
p=argparse.ArgumentParser();p.add_argument('ply',type=Path);p.add_argument('data',type=Path);p.add_argument('out',type=Path);a=p.parse_args();v=PlyData.read(str(a.ply))['vertex'];xyz=np.stack([v[k] for k in ['x','y','z']],1);dem=np.load(a.data/'terrain.npz')['vertices'];dist,idx=cKDTree(dem[:,:2]).query(xyz[:,:2]);valid=(dist<=1.5)&np.isfinite(xyz).all(1);dz=np.abs(xyz[valid,2]-dem[idx[valid],2]);assert len(dz)>0
r={'scope':'Gaussian centres vs source DEM; not rendered surface accuracy','covered_gaussians':int(valid.sum()),'out_of_footprint':int((~valid).sum()),'median_abs_height_error_m':float(np.median(dz)),'p95_abs_height_error_m':float(np.quantile(dz,.95)),'independent_geometry_validation':False};a.out.write_text(json.dumps(r,indent=2));print(r)
