import numpy as np
import sys
sys.path.append('solid_mechanics_app/src')
from math_engine.tensor_math import get_failure_criteria, get_principal_stresses

T1 = np.array([[100, 0, 0], [0, 0, 0], [0, 0, 0]])
f1 = get_failure_criteria(T1)
print("T1:", f1)

T2 = np.array([[0, 50, 0], [50, 0, 0], [0, 0, 0]])
f2 = get_failure_criteria(T2)
print("T2:", f2)

