import numpy as np

def get_principal_stresses(stress_tensor: np.ndarray):
    """
    Calculates the principal stresses (eigenvalues) and principal directions (eigenvectors)
    for a given 3x3 stress tensor.
    """
    # Ensure it's a symmetric tensor
    sym_tensor = (stress_tensor + stress_tensor.T) / 2
    
    # Calculate eigenvalues and eigenvectors
    eigenvalues, eigenvectors = np.linalg.eigh(sym_tensor)
    
    # Sort them in descending order (sigma_1 >= sigma_2 >= sigma_3)
    idx = eigenvalues.argsort()[::-1]
    principal_stresses = eigenvalues[idx]
    principal_directions = eigenvectors[:, idx]
    
    return principal_stresses, principal_directions

def get_mohr_circle_parameters(stress_tensor: np.ndarray):
    """
    Returns the centers and radii of the 3 Mohr's circles for a 3D stress state.
    """
    ps, _ = get_principal_stresses(stress_tensor)
    sigma1, sigma2, sigma3 = ps[0], ps[1], ps[2]
    
    c12 = (sigma1 + sigma2) / 2
    r12 = abs(sigma1 - sigma2) / 2
    
    c23 = (sigma2 + sigma3) / 2
    r23 = abs(sigma2 - sigma3) / 2
    
    c13 = (sigma1 + sigma3) / 2
    r13 = abs(sigma1 - sigma3) / 2
    
    return {
        "C12": c12, "R12": r12,
        "C23": c23, "R23": r23,
        "C13": c13, "R13": r13,
        "principal_stresses": ps
    }

def get_stress_invariants(stress_tensor: np.ndarray):
    """
    Computes the three stress invariants (Lecture 10).
    I1 = tr(σ), I2 = 0.5*(tr(σ)² - tr(σ²)), I3 = det(σ)
    """
    I1 = float(np.trace(stress_tensor))
    I2 = float(0.5 * (np.trace(stress_tensor)**2 - np.trace(stress_tensor @ stress_tensor)))
    I3 = float(np.linalg.det(stress_tensor))
    sigma_m = I1 / 3.0  # Hydrostatic (mean) stress
    deviatoric = stress_tensor - sigma_m * np.eye(3)
    return {
        "I1": I1, "I2": I2, "I3": I3,
        "sigma_m": sigma_m,
        "deviatoric_matrix": deviatoric.tolist()
    }

def get_failure_criteria(stress_tensor: np.ndarray):
    ps, _ = get_principal_stresses(stress_tensor)
    s1, s2, s3 = ps[0], ps[1], ps[2]
    vm = np.sqrt(((s1-s2)**2 + (s2-s3)**2 + (s3-s1)**2) / 2.0)
    tresca = s1 - s3
    sigma_m = float(np.trace(stress_tensor)) / 3.0
    return {"von_mises": vm, "tresca": tresca, "sigma_m": sigma_m}

def get_strain_energy_density(stress_tensor: np.ndarray, E: float, nu: float):
    """
    Computes the total strain energy density and its decomposition (Lectures 29-30).
    U_total = (1/2) * σ_ij * ε_ij = (1/2) * tr(σ·ε)
    U_vol   = (3(1-2ν) / 2E) * σ_m²    (volumetric / hydrostatic)
    U_dist  = U_total - U_vol           (distortional, governs von Mises)
    """
    # Compute strain via Hooke's Law
    s_kk = np.trace(stress_tensor)
    strain_tensor = ((1.0 + nu) / E) * stress_tensor - (nu / E) * s_kk * np.eye(3)
    # Total strain energy density: U = (1/2) tr(σ·ε)
    U_total = float(0.5 * np.sum(stress_tensor * strain_tensor))
    # Volumetric component
    sigma_m = s_kk / 3.0
    U_vol = float((3.0 * (1.0 - 2.0 * nu) / (2.0 * E)) * sigma_m**2)
    # Distortional component (directly related to von Mises)
    U_dist = U_total - U_vol
    return {
        "U_total": U_total,
        "U_vol": U_vol,
        "U_dist": U_dist
    }

def get_strain_tensor(stress_tensor: np.ndarray, E: float, nu: float):
    """
    Generalized Hooke's Law for Isotropic Material (Lecture 11).
    ε_ij = (1+ν)/E * σ_ij - ν/E * σ_kk * δ_ij
    """
    s_kk = np.trace(stress_tensor)
    strain_tensor = ((1.0 + nu) / E) * stress_tensor - (nu / E) * s_kk * np.eye(3)
    e_kk = np.trace(strain_tensor)
    deviatoric_strain = strain_tensor - (e_kk / 3.0) * np.eye(3)
    return {
        "strain_matrix": strain_tensor.tolist(),
        "dilatation": float(e_kk),
        "deviatoric_matrix": deviatoric_strain.tolist()
    }

def get_traction_vector(stress_tensor: np.ndarray, n: list):
    """
    Cauchy's stress theorem (Lecture 2): T = σ · n̂
    """
    n_arr = np.array(n, dtype=float)
    n_norm = np.linalg.norm(n_arr)
    if n_norm > 0:
        n_arr = n_arr / n_norm
    else:
        n_arr = np.array([1.0, 0.0, 0.0])
    
    T = np.dot(stress_tensor, n_arr)
    sigma_n = np.dot(T, n_arr)
    tau_n = np.linalg.norm(T - sigma_n * n_arr)
    
    return {
        "T": T.tolist(),
        "sigma_n": float(sigma_n),
        "tau_n": float(tau_n)
    }
