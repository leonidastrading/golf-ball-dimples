# Dimple Lab

Interactive golf ball dimple designer with a rotatable/zoomable 3D ball and an aerodynamic flight simulator. The Titleist Pro V1 is the default baseline.

- **Design controls:** symmetry pattern (tetrahedral / octahedral / icosahedral geodesic lattices, or Fibonacci spiral), dimple count, mean diameter ↔ surface coverage (linked), depth, size variation, shape (spherical, steep-wall, conical C-dimple, dual/nested, raised-center, hexagonal), wall steepness, micro-dimples, paint process and thickness, asymmetric (Polara / hemispheric) layouts.
- **Launch & conditions:** ball speed, launch angle, backspin, spin-axis tilt, wind, temperature, altitude, humidity, fairway firmness, plus Tour / amateur / iron / wedge / USGA ODS 2028 presets.
- **Outputs:** carry, total, apex, hang time, descent angle, offline; side and top trajectory views; Cd and Cl vs air speed; dimple cross-section; USGA symmetry test and ODS 2028 projection.
- **Patent library:** approximations of verified dimple-pattern patents (Taylor 1908, Uniroyal 252, Nepela/Polara, Shaw, Lisco, 12-20 hedron, pentagonal hexecontahedron).

```bash
npm install
npm run dev        # local dev server
npm run build      # production build to dist/
npm run calibrate  # print model output for every preset
```

The aerodynamic model is semi-empirical (see "How the model works" in the app). It's calibrated to Pro V1 + PGA Tour driver averages, and its trends follow published research. Treat absolute numbers for unusual designs as estimates.

Deploys on Vercel as a static Vite app (`vercel.json`).
