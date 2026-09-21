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
