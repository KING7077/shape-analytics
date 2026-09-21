/**
 * mathUtils.js
 * Contains solid mechanics mathematical functions using math.js
 */

class TensorMath {
    static getPrincipalStresses(matrix) {
        let symMatrix = [
            [matrix[0][0], (matrix[0][1] + matrix[1][0])/2, (matrix[0][2] + matrix[2][0])/2],
            [(matrix[1][0] + matrix[0][1])/2, matrix[1][1], (matrix[1][2] + matrix[2][1])/2],
            [(matrix[2][0] + matrix[0][2])/2, (matrix[2][1] + matrix[1][2])/2, matrix[2][2]]
        ];
        try {
            const result = math.eigs(symMatrix);
            let evals = result.values;
            if (evals.toArray) evals = evals.toArray();
            evals.sort((a, b) => b - a);
            return evals;
        } catch (e) {
            console.error("Error calculating eigenvalues:", e);
            return [symMatrix[0][0], symMatrix[1][1], symMatrix[2][2]].sort((a, b) => b - a);
        }
    }

    static getMohrCircleParameters(principalStresses) {
        const s1 = principalStresses[0];
        const s2 = principalStresses[1];
        const s3 = principalStresses[2];
        return {
            c12: (s1 + s2) / 2, r12: Math.abs(s1 - s2) / 2,
            c23: (s2 + s3) / 2, r23: Math.abs(s2 - s3) / 2,
            c13: (s1 + s3) / 2, r13: Math.abs(s1 - s3) / 2,
            tMax: Math.abs(s1 - s3) / 2
        };
    }

    static getVonMises(s1, s2, s3) {
        return Math.sqrt(0.5 * (Math.pow(s1-s2, 2) + Math.pow(s2-s3, 2) + Math.pow(s3-s1, 2)));
    }
}

class BeamMath {
    /**
     * Solves a cantilever beam with a point load P at the free end (x=L).
     * @param {number} L Length (m)
     * @param {number} b Width (m)
     * @param {number} h Height (m)
     * @param {number} P Point load at tip (N) downward
     * @param {number} E Young's Modulus (Pa)
     */
    constructor(L, b, h, P, E) {
        this.L = L;
        this.b = b;
        this.h = h;
        this.P = P;
        this.E = E;
        this.I = (b * Math.pow(h, 3)) / 12; // Area moment of inertia
    }

    // Macroscopic: x is distance from clamped root
    getShearForce(x) {
        return this.P; // Constant shear V(x) = P for cantilever with tip load
    }

    getBendingMoment(x) {
        // M(x) = -P(L-x)  (hogging moment)
        return -this.P * (this.L - x);
    }

    getDeflection(x) {
        // y(x) = -P*x^2 * (3L - x) / (6EI)
        return -(this.P * Math.pow(x, 2) * (3 * this.L - x)) / (6 * this.E * this.I);
    }

    // Microscopic: y is distance from neutral axis (-h/2 to h/2)
    getNormalStress(x, y) {
        // sigma_xx = -M(x)*y / I
        return -(this.getBendingMoment(x) * y) / this.I;
    }

    getShearStress(x, y) {
        // Parabolic shear: tau_xy = VQ / Ib = V / 2I * ( (h/2)^2 - y^2 )
        const maxTau = (3 * this.getShearForce(x)) / (2 * this.b * this.h);
        return maxTau * (1 - Math.pow((2 * y) / this.h, 2));
    }

    getStressTensor(x, y) {
        const sig_x = this.getNormalStress(x, y);
        const tau_xy = this.getShearStress(x, y);
        return [
            [sig_x, tau_xy, 0],
            [tau_xy, 0, 0],
            [0, 0, 0]
        ];
    }

    getVonMisesAt(x, y) {
        const tensor = this.getStressTensor(x, y);
        const ps = TensorMath.getPrincipalStresses(tensor);
        return TensorMath.getVonMises(ps[0], ps[1], ps[2]);
    }
}
