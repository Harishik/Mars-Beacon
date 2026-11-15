import json
import numpy as np
from environment_fields import *
checks={}
checks['season_wrap']=bool(np.isclose(seasonal_tau(0),seasonal_tau(360)))
checks['storm_causal']=bool(storm_envelope(-1,1,100,1000)==0)
checks['unit_sun']=bool(np.isclose(np.linalg.norm(sun_enu(-4.86,255,8)),1))
flat=np.zeros((16,16));norm=terrain_normals(flat);sun=sun_enu(0,0,12)
checks['flat_normal']=bool(np.allclose(norm,[0,0,1]))
checks['zenith_airmass']=bool(abs(float(exponential_airmass(1.))-1)<.002)
checks['night_zero']=bool(np.all(direct_irradiance(norm,sun_enu(0,0,0),.3,0)==0))
checks['dust_reduces_direct_sun']=bool(np.all(direct_irradiance(norm,sun,1.,0)<direct_irradiance(norm,sun,.1,0)))
checks['shadow_zero']=bool(np.all(direct_irradiance(norm,sun,.3,0,visible=0)==0))
checks['column_units']=bool(np.isclose(atmospheric_column(610)['g_cm2'],16.39344262295))
# Verify the analytic heat field satisfies dT/dt = alpha*d2T/dz2 by finite difference.
a=1e-7;z=.05;t=12345.;dz=1e-5;dt=.1;T=lambda z,t:harmonic_temperature(z,t,210,30,a)
dtdt=(T(z,t+dt)-T(z,t-dt))/(2*dt);lap=(T(z+dz,t)-2*T(z,t)+T(z-dz,t))/dz**2
checks['heat_equation_residual']=bool(abs(dtdt-a*lap)<1e-7)
checks['one_sol_periodic']=bool(np.isclose(T(z,t),T(z,t+SOL_S)))
ridge=np.zeros((16,16));ridge[3,:]=8
horizon=local_horizon(ridge,max_distance_m=12)
checks['ridge_occludes_low_sun']=bool(local_solar_visibility(horizon,np.array([0.,np.cos(.2),np.sin(.2)]))[10,8]==0)
assert all(checks.values()),checks
print(json.dumps({'passed':True,'checks':checks,'scope':'numerical and physical invariants; no observational calibration'},indent=2))
