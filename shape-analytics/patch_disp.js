function calculateHalfSpaceDisplacement(x, y, z, Px, Py, Pz, a, nu, E) {
    const R = Math.sqrt(x*x + y*y + z*z + a*a);
    const Rz = R + z;
    const r2 = x*x + y*y;
    
    let ux = 0, uy = 0, uz = 0;
    
    // Normal load (Pz) - Boussinesq
    if (Math.abs(Pz) > 0) {
        const C = (Pz * (1 + nu)) / (2 * Math.PI * E * R);
        uz += C * (2 * (1 - nu) + (z * z) / (R * R));
        if (r2 > 0) {
            const ur = (Pz * (1 - 2*nu) * (1 + nu)) / (2 * Math.PI * E * Math.sqrt(r2)) * ((z/R) - 1 + (r2*z)/(R*R*R));
            ux += ur * (x / Math.sqrt(r2));
            uy += ur * (y / Math.sqrt(r2));
        }
    }
    
    // Shear load X (Px) - Cerruti
    if (Math.abs(Px) > 0) {
        const C = (Px * (1 + nu)) / (2 * Math.PI * E * R);
        ux += C * (1 + (x*x)/(R*R) + (1 - 2*nu)*(R/Rz - (x*x)/(Rz*Rz)));
        uy += C * ((x*y)/(R*R) - (1 - 2*nu)*((x*y)/(Rz*Rz)));
        uz += C * ((x*z)/(R*R) + (1 - 2*nu)*(x/Rz));
    }
    
    // Shear load Y (Py) - Cerruti
    if (Math.abs(Py) > 0) {
        const C = (Py * (1 + nu)) / (2 * Math.PI * E * R);
        ux += C * ((x*y)/(R*R) - (1 - 2*nu)*((x*y)/(Rz*Rz)));
        uy += C * (1 + (y*y)/(R*R) + (1 - 2*nu)*(R/Rz - (y*y)/(Rz*Rz)));
        uz += C * ((y*z)/(R*R) + (1 - 2*nu)*(y/Rz));
    }
    
    return { ux, uy, uz };
}
