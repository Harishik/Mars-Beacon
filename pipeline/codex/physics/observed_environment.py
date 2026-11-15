"""Read-only measured environment replay. Never fills missing spatial/temporal support."""
from pathlib import Path
import csv,json
import numpy as np
ROOT=Path(__file__).resolve().parents[1]/'data/observed_atmosphere'
def pressure_replay(sol,ltst_hour,max_separation_hours=.5):
 assert 0<=ltst_hour<24
 rows=list(csv.DictReader((ROOT/'rems_halfhour_observations.csv').open()));eligible=[r for r in rows if int(r['sol'])==int(sol) and int(r['pressure_n'])>0]
 if not eligible:return {'pressure_pa':None,'status':'missing','sol':sol,'ltst_hour':ltst_hour}
 row=min(eligible,key=lambda r:abs(float(r['ltst_hour_center'])-ltst_hour));offset=abs(float(row['ltst_hour_center'])-ltst_hour)
 if offset>max_separation_hours:return {'pressure_pa':None,'status':'gap','nearest_hours':offset}
 return {'pressure_pa':float(row['pressure_pa']),'status':'observed_rover_local','sample_count':int(row['pressure_n']),'time_offset_hours':offset,'spatial_support':'rover measurement footprint; not a full terrain tile','prediction':False}
def opacity_replay(sol,wavelength_nm=880,max_separation_sols=.5):
 assert wavelength_nm in [440,880]
 d=np.genfromtxt(ROOT/f'tau_{wavelength_nm}_daily.csv',delimiter=',',names=True,dtype=None,encoding='utf-8');idx=np.argmin(abs(d['sol_integer']-sol));gap=float(abs(d['sol_integer'][idx]-sol))
 if gap>max_separation_sols:return {'tau':None,'status':'outside_observed_support','nearest_distance_sols':gap,'wavelength_nm':wavelength_nm}
 return {'tau':float(d['tau'][idx]),'sigma_combined':float(d['sigma_combined'][idx]),'wavelength_nm':wavelength_nm,'status':'observed_rover_column','sol':int(d['sol_integer'][idx]),'prediction':False,'note':'combined random uncertainty excludes shared calibration covariance'}
def seasonal_opacity(ls_deg,wavelength_nm=880):
 m=json.loads((ROOT/f'tau_{wavelength_nm}_model.json').read_text());k=m['model']['harmonics'];angle=np.deg2rad(ls_deg);x=[1.]+[f(i*angle) for i in range(1,k+1) for f in [np.sin,np.cos]];pred=float(np.exp(np.dot(x,m['model']['coefficients'])));q=m['validation_calibrated_absolute_band_tau']
 return {'tau':pred,'wavelength_nm':wavelength_nm,'status':'empirical_climatology','interval':[max(0,pred-q),pred+q],'interval_test_coverage':m['test_band_coverage'],'storm_forecast':False,'spatial_support':'Gale rover column; no resolved spatial gradients'}
if __name__=='__main__':
 assert opacity_replay(4714)['tau'] is None
 assert pressure_replay(4714,12)['status'] in ['observed_rover_local','gap']
 assert pressure_replay(9999,12)['pressure_pa'] is None
 assert np.isclose(seasonal_opacity(0)['tau'],seasonal_opacity(360)['tau'])
 print(json.dumps({'checks_passed':True,'campaign_example':{'pressure':pressure_replay(4714,12),'opacity':opacity_replay(4714)}},indent=2))
