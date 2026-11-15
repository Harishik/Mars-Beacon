"""Offline environmental primitives; explicit scenario inputs, no learned terrain motion.
Solar geometry is a circular-obliquity approximation parameterized by Ls and LTST.
Use Mars24/SPICE for a dated mission ephemeris. Optical depth is at ONE wavelength.
"""
import numpy as np
SOL_S=88775.2

def seasonal_tau(ls_deg,baseline=.25,peaks=((255.,.4,35.),(135.,.1,25.))):
 ls=np.asarray(ls_deg);out=np.full_like(ls,baseline,dtype=float)
 for center,amplitude,width in peaks:
  assert amplitude>=0 and width>0
  d=(ls-center+180)%360-180;out+=amplitude*np.exp(-.5*(d/width)**2)
 return out

def storm_envelope(seconds_since_start,amplitude,rise_s,decay_s):
 assert amplitude>=0 and rise_s>0 and decay_s>0
 t=np.maximum(seconds_since_start,0.)
 return amplitude*(-np.expm1(-t/rise_s))*np.exp(-t/decay_s)

def sun_enu(latitude_deg,ls_deg,ltst_hours):
 phi=np.deg2rad(latitude_deg);dec=np.arcsin(np.sin(np.deg2rad(25.19))*np.sin(np.deg2rad(ls_deg)));hour=np.deg2rad(15*(ltst_hours-12))
 return np.array([-np.cos(dec)*np.sin(hour),np.cos(phi)*np.sin(dec)-np.sin(phi)*np.cos(dec)*np.cos(hour),np.sin(phi)*np.sin(dec)+np.cos(phi)*np.cos(dec)*np.cos(hour)])

def terrain_normals(height_m,pixel_m=1.):
 # Raster rows increase southward, unlike north-positive world Y.
 dz_south,dz_east=np.gradient(height_m,pixel_m,pixel_m)
 n=np.stack([-dz_east,dz_south,np.ones_like(height_m)],-1)
 return n/np.linalg.norm(n,axis=-1,keepdims=True)

def exponential_airmass(mu,radius_m=3389500.,scale_height_m=11100.):
 """Spherical exponential atmosphere line integral / vertical column; daylight only."""
 mu=np.asarray(mu);s=np.linspace(0,2_000_000.,2049)
 z=np.sqrt(radius_m**2+s[:,None]**2+2*radius_m*s[:,None]*mu.reshape(1,-1))-radius_m
 f=np.exp(-z/scale_height_m)/scale_height_m
 vals=np.sum((f[1:]+f[:-1])*.5*np.diff(s)[:,None],axis=0).reshape(mu.shape)
 return vals

def direct_irradiance(normals,sun,tau,ls_deg,visible=1.):
 """Return irradiance incident on slope, W/m2. Apply cosine exactly once.
Direct-only grey approximation: not broadband-calibrated or total energy balance.
"""
 if sun[2]<=0:return np.zeros(normals.shape[:-1])
 e=.0934;toa=590*((1+e*np.cos(np.deg2rad(ls_deg-251)))/(1-e*e))**2
 dni=toa*np.exp(-np.asarray(tau)*exponential_airmass(sun[2]))
 return dni*np.maximum(normals@sun,0)*visible

def harmonic_temperature(depth_m,seconds,mean_k,amplitude_k,diffusivity_m2_s,phase_rad=0.):
 """Exact periodic semi-infinite 1D conduction response to prescribed surface T.
Analytic verification fixture, NOT a fitted Mars temperature forecast.
"""
 assert diffusivity_m2_s>0
 omega=2*np.pi/SOL_S;skin=np.sqrt(2*diffusivity_m2_s/omega)
 return mean_k+amplitude_k*np.exp(-np.asarray(depth_m)/skin)*np.cos(omega*np.asarray(seconds)-np.asarray(depth_m)/skin-phase_rad)

def atmospheric_column(pressure_pa,gravity_m_s2=3.721):
 """Column mass only; no dose conversion or shielding claims."""
 kg_m2=np.asarray(pressure_pa)/gravity_m_s2
 return {'kg_m2':kg_m2,'g_cm2':kg_m2*.1}

def local_horizon(height_m,pixel_m=1.,azimuth_count=32,max_distance_m=64.):
 """Sample local DEM skyline. Outside the supplied tile is unknown, not clear sky."""
 from scipy.ndimage import map_coordinates
 rr,cc=np.indices(height_m.shape,dtype=float);out=[]
 for az in np.linspace(0,2*np.pi,azimuth_count,endpoint=False):
  best=np.zeros_like(height_m,dtype=float)
  for distance in np.arange(pixel_m,max_distance_m+pixel_m,pixel_m):
   h=map_coordinates(height_m,[rr-distance*np.cos(az)/pixel_m,cc+distance*np.sin(az)/pixel_m],order=1,mode='constant',cval=np.nan)
   angle=np.arctan2(h-height_m,distance);best=np.maximum(best,np.nan_to_num(angle,nan=0.))
  out.append(best)
 return np.stack(out)

def local_solar_visibility(horizon,sun):
 if sun[2]<=0:return np.zeros(horizon.shape[1:])
 az=np.arctan2(sun[0],sun[1])%(2*np.pi);u=az/(2*np.pi)*len(horizon);i=int(np.floor(u));w=u-i
 skyline=(1-w)*horizon[i%len(horizon)]+w*horizon[(i+1)%len(horizon)]
 return (np.arcsin(np.clip(sun[2],-1,1))>skyline).astype(float)
