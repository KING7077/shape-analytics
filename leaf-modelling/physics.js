export class StemPhysics {
    constructor(params) {
        this.update(params);
    }

    update(params) {
        this.L  = params.stemLength;       // m
        this.d  = params.stemDiameter;     // m
        this.E  = params.youngsModulus;    // Pa
        this.nu = params.poissonsRatio;
        this.G  = this.E / (2 * (1 + this.nu));
        this.I  = Math.PI * Math.pow(this.d, 4) / 64;
        this.J  = Math.PI * Math.pow(this.d, 4) / 32;
        this.EI = this.E * this.I;
        this.GJ = this.G * this.J;
        this.nNodes = params.nNodes || 24;
    }

    deflection(X, F) {
        return (F / (6 * this.EI)) * X * X * (3 * this.L - X);
    }

    slope(X, F) {
        return (F / (2 * this.EI)) * X * (2 * this.L - X);
    }

    twist(X, T) {
        return (T * X) / this.GJ;
    }

    moment(X, F) {
        return F * (this.L - X);
    }

    maxBendingStress(F) {
        const M_max = Math.abs(F) * this.L;
        return M_max * (this.d / 2) / this.I;
    }

    maxShearStress(T) {
        return Math.abs(T) * (this.d / 2) / this.J;
    }

    solve(Fy, Fz, T) {
        const nodes = [];
        const dx = this.L / (this.nNodes - 1);
        for (let i = 0; i < this.nNodes; i++) {
            const X = i * dx;
            nodes.push({
                x: X,
                y: this.deflection(X, Fy),
                z: this.deflection(X, Fz),
                slopeY: this.slope(X, Fy),
                slopeZ: this.slope(X, Fz),
                twist: this.twist(X, T),
                momentY: this.moment(X, Fz),
                momentZ: this.moment(X, Fy),
            });
        }
        return nodes;
    }
}

export class WindModel {
    constructor(params) {
        this.update(params);
        this.noisePhase = [
            Math.random() * 100,
            Math.random() * 100,
            Math.random() * 100
        ];
    }

    update(params) {
        this.F0     = params.windStrength;
        this.freq   = params.windFrequency;
        this.gust   = params.gustIntensity;
        this.leafB  = params.leafB || 0.05;
    }

    _noise(t, seed) {
        return Math.sin(t * 7.23 + seed) * 0.4
             + Math.sin(t * 13.71 + seed * 2.1) * 0.3
             + Math.sin(t * 23.14 + seed * 0.7) * 0.2
             + Math.sin(t * 41.07 + seed * 3.3) * 0.1;
    }

    getForceY(t) {
        const w = this.freq * 2 * Math.PI;
        return this.F0 * (
            Math.sin(w * t) +
            0.3 * Math.sin(1.73 * w * t + Math.PI / 4) +
            this.gust * this._noise(t, this.noisePhase[0])
        );
    }

    getForceZ(t) {
        const w = this.freq * 2 * Math.PI;
        return this.F0 * (
            0.7 * Math.sin(0.81 * w * t + Math.PI / 3) +
            0.2 * Math.sin(2.17 * w * t) +
            this.gust * this._noise(t, this.noisePhase[1])
        );
    }

    getTorque(t) {
        const w = this.freq * 2 * Math.PI;
        const T0 = this.F0 * (this.leafB / 3);
        return T0 * (
            Math.sin(1.31 * w * t + Math.PI / 6) +
            0.25 * this._noise(t, this.noisePhase[2])
        );
    }
}
