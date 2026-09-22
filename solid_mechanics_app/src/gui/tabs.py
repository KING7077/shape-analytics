import numpy as np
import requests
from PyQt6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QGridLayout, QLabel, QLineEdit, QPushButton, QGroupBox,
    QComboBox, QCheckBox, QFormLayout
)
from matplotlib.backends.backend_qtagg import FigureCanvasQTAgg as FigureCanvas
from matplotlib.figure import Figure
from gui.gl_widget import GLStressCubeWidget
from gui.mohr_widget import MohrCircleWidget

API_URL = "http://127.0.0.1:8000/api"

import matplotlib.pyplot as plt
plt.style.use('dark_background')

class MatplotlibCanvas(FigureCanvas):
    def __init__(self, parent=None, width=5, height=4, dpi=100):
        fig = Figure(figsize=(width, height), dpi=dpi)
        fig.patch.set_facecolor('#080c16')
        self.axes = fig.add_subplot(111)
        self.axes.set_facecolor('#080c16')
        self.axes.tick_params(colors='#60728c')
        for spine in self.axes.spines.values():
            spine.set_color('#1a2233')
        self.axes.xaxis.label.set_color('#94a3b8')
        self.axes.yaxis.label.set_color('#94a3b8')
        self.axes.title.set_color('#00e5a0')
        super(MatplotlibCanvas, self).__init__(fig)
        self.setParent(parent)

class PointStressTab(QWidget):
    def __init__(self):
        super().__init__()
        layout = QHBoxLayout(self)
        
        # Left Panel (Inputs)
        left_panel = QVBoxLayout()
        group_box = QGroupBox("Stress Tensor Input (MPa)")
        grid = QGridLayout()
        
        self.inputs = []
        for i in range(3):
            row = []
            for j in range(3):
                line_edit = QLineEdit("0.0")
                if i == j:
                    if i == 0: line_edit.setText("100.0")
                    elif i == 1: line_edit.setText("50.0")
                grid.addWidget(line_edit, i, j)
                row.append(line_edit)
            self.inputs.append(row)
        group_box.setLayout(grid)
        left_panel.addWidget(group_box)
        
        mat_box = QGroupBox("Material & Plane")
        mat_layout = QFormLayout()
        self.sy_input = QLineEdit("250.0")
        self.e_input = QLineEdit("200.0")
        self.nu_input = QLineEdit("0.3")
        self.nx = QLineEdit("1.0")
        self.ny = QLineEdit("0.0")
        self.nz = QLineEdit("0.0")
        mat_layout.addRow("Sy (MPa):", self.sy_input)
        mat_layout.addRow("E (GPa):", self.e_input)
        mat_layout.addRow("Poisson's Ratio:", self.nu_input)
        mat_layout.addRow("n_x:", self.nx)
        mat_layout.addRow("n_y:", self.ny)
        mat_layout.addRow("n_z:", self.nz)
        mat_box.setLayout(mat_layout)
        left_panel.addWidget(mat_box)
        
        calc_btn = QPushButton("Calculate")
        calc_btn.clicked.connect(self.calculate)
        left_panel.addWidget(calc_btn)
        
        self.results_lbl = QLabel("Results will appear here.")
        left_panel.addWidget(self.results_lbl)
        left_panel.addStretch()
        layout.addLayout(left_panel, 1)
        
        # Middle Panel (3D)
        middle_panel = QVBoxLayout()
        self.gl_widget = GLStressCubeWidget()
        middle_panel.addWidget(QLabel("3D Stress State"))
        middle_panel.addWidget(self.gl_widget)
        layout.addLayout(middle_panel, 2)
        
        # Right Panel (Mohr)
        right_panel = QVBoxLayout()
        self.mohr_widget = MohrCircleWidget()
        right_panel.addWidget(QLabel("Mohr's Circle"))
        right_panel.addWidget(self.mohr_widget)
        layout.addLayout(right_panel, 2)
        
    def calculate(self):
        try:
            tensor = [[float(self.inputs[i][j].text()) for j in range(3)] for i in range(3)]
            data = {
                "matrix": tensor,
                "Sy": float(self.sy_input.text()),
                "E": float(self.e_input.text()),
                "nu": float(self.nu_input.text()),
                "n_vec": [float(self.nx.text()), float(self.ny.text()), float(self.nz.text())]
            }
            res = requests.post(f"{API_URL}/analyze_tensor", json=data).json()
            
            # Update Mohr
            m = res["mohr"]
            self.mohr_widget.update_plot(m["c12"], m["r12"], m["c23"], m["r23"], m["c13"], m["r13"], res["principal_stresses"])
            
            # Update labels
            fail = res["failure"]
            tr = res["traction"]
            txt = f"Principal Stresses: {res['principal_stresses']}\n"
            txt += f"Von Mises: {fail['von_mises']:.2f} MPa (FS: {fail['fs_vm']:.2f})\n"
            txt += f"Tresca: {fail['tresca']:.2f} MPa (FS: {fail['fs_tresca']:.2f})\n"
            txt += f"Traction: T={tr['T']} MPa\nSigma_n: {tr['sigma_n']:.2f} MPa, Tau_n: {tr['tau_n']:.2f} MPa"
            self.results_lbl.setText(txt)
            
            self.gl_widget.update()
        except Exception as e:
            self.results_lbl.setText(f"Error: {e}")

class BeamTab(QWidget):
    def __init__(self):
        super().__init__()
        layout = QHBoxLayout(self)
        
        # Inputs
        left = QVBoxLayout()
        form = QFormLayout()
        self.l_in = QLineEdit("5.0")
        self.b_in = QLineEdit("0.1")
        self.h_in = QLineEdit("0.2")
        self.e_in = QLineEdit("200e9")
        self.p_in = QLineEdit("10000.0")
        self.sy_in = QLineEdit("250e6")
        
        self.supp_cb = QComboBox()
        self.supp_cb.addItems(["cantilever", "simply_supported"])
        self.load_cb = QComboBox()
        self.load_cb.addItems(["point", "udl"])
        
        form.addRow("Length (m):", self.l_in)
        form.addRow("Width (m):", self.b_in)
        form.addRow("Height (m):", self.h_in)
        form.addRow("E (Pa):", self.e_in)
        form.addRow("Load Mag (N or N/m):", self.p_in)
        form.addRow("Sy (Pa):", self.sy_in)
        form.addRow("Support:", self.supp_cb)
        form.addRow("Load:", self.load_cb)
        left.addLayout(form)
        
        btn = QPushButton("Analyze")
        btn.clicked.connect(self.calculate)
        left.addWidget(btn)
        
        self.res_lbl = QLabel()
        left.addWidget(self.res_lbl)
        left.addStretch()
        layout.addLayout(left, 1)
        
        # Plots
        right = QVBoxLayout()
        self.canvas1 = MatplotlibCanvas()
        self.canvas2 = MatplotlibCanvas()
        right.addWidget(self.canvas1)
        right.addWidget(self.canvas2)
        layout.addLayout(right, 3)
        
    def calculate(self):
        try:
            data = {
                "L": float(self.l_in.text()), "b": float(self.b_in.text()), "h": float(self.h_in.text()),
                "E": float(self.e_in.text()), "load_mag": float(self.p_in.text()), "Sy": float(self.sy_in.text()),
                "support_type": self.supp_cb.currentText(), "load_type": self.load_cb.currentText()
            }
            res = requests.post(f"{API_URL}/analyze_beam", json=data).json()
            
            x = res["x"]
            self.canvas1.axes.clear()
            self.canvas1.axes.plot(x, res["V"], label="SFD (kN)")
            self.canvas1.axes.plot(x, res["M"], label="BMD (kN.m)")
            self.canvas1.axes.legend()
            self.canvas1.axes.set_title("Shear & Bending Moment")
            self.canvas1.draw()
            
            self.canvas2.axes.clear()
            heatmap = np.array(res["heatmap"])
            c = self.canvas2.axes.contourf(x, res["y_cross"], heatmap, cmap="jet")
            self.canvas2.axes.set_title("Von Mises Stress (MPa)")
            if not hasattr(self, "cbar"):
                self.cbar = self.canvas2.figure.colorbar(c, ax=self.canvas2.axes)
            else:
                self.cbar.update_normal(c)
            self.canvas2.draw()
            
            self.res_lbl.setText(f"Max VM: {res['max_vm']:.2f} MPa\nMax Tresca: {res['max_tresca']:.2f} MPa\nFS VM: {res['fs_vm']:.2f}")
        except Exception as e:
            self.res_lbl.setText(f"Error: {e}")

class TorsionTab(QWidget):
    def __init__(self):
        super().__init__()
        layout = QHBoxLayout(self)
        
        left = QVBoxLayout()
        form = QFormLayout()
        self.t_in = QLineEdit("500.0")
        self.l_in = QLineEdit("2.0")
        self.g_in = QLineEdit("80e9")
        self.r_in = QLineEdit("0.05")
        self.ri_in = QLineEdit("0.0")
        
        form.addRow("Torque (Nm):", self.t_in)
        form.addRow("Length (m):", self.l_in)
        form.addRow("G (Pa):", self.g_in)
        form.addRow("Outer Radius (m):", self.r_in)
        form.addRow("Inner Radius (m):", self.ri_in)
        left.addLayout(form)
        
        btn = QPushButton("Analyze")
        btn.clicked.connect(self.calculate)
        left.addWidget(btn)
        
        self.res_lbl = QLabel()
        left.addWidget(self.res_lbl)
        left.addStretch()
        layout.addLayout(left, 1)
        
        right = QVBoxLayout()
        self.canvas = MatplotlibCanvas()
        right.addWidget(self.canvas)
        layout.addLayout(right, 2)
        
    def calculate(self):
        try:
            data = {
                "T": float(self.t_in.text()), "L": float(self.l_in.text()),
                "G": float(self.g_in.text()), "R": float(self.r_in.text()), "ri": float(self.ri_in.text())
            }
            res = requests.post(f"{API_URL}/analyze_torsion", json=data).json()
            
            self.canvas.axes.clear()
            self.canvas.axes.plot(res["r"], res["tau"])
            self.canvas.axes.set_title("Shear Stress vs Radius")
            self.canvas.axes.set_xlabel("Radius (m)")
            self.canvas.axes.set_ylabel("Shear Stress (MPa)")
            self.canvas.draw()
            
            self.res_lbl.setText(f"Max Twist: {res['phi_max_deg']:.2f} deg\nMax Shear: {res['tau_max']:.2f} MPa")
        except Exception as e:
            self.res_lbl.setText(f"Error: {e}")

class AxialTab(QWidget):
    def __init__(self):
        super().__init__()
        layout = QHBoxLayout(self)
        left = QVBoxLayout()
        form = QFormLayout()
        self.p_in = QLineEdit("50000.0")
        self.l_in = QLineEdit("3.0")
        self.a_in = QLineEdit("0.005")
        self.e_in = QLineEdit("200e9")
        form.addRow("Load (N):", self.p_in)
        form.addRow("Length (m):", self.l_in)
        form.addRow("Area (m^2):", self.a_in)
        form.addRow("E (Pa):", self.e_in)
        left.addLayout(form)
        
        btn = QPushButton("Analyze")
        btn.clicked.connect(self.calculate)
        left.addWidget(btn)
        
        self.res_lbl = QLabel()
        left.addWidget(self.res_lbl)
        left.addStretch()
        layout.addLayout(left, 1)
        
        right = QVBoxLayout()
        self.canvas = MatplotlibCanvas()
        right.addWidget(self.canvas)
        layout.addLayout(right, 2)
        
    def calculate(self):
        try:
            data = {
                "P": float(self.p_in.text()), "L": float(self.l_in.text()),
                "A": float(self.a_in.text()), "E": float(self.e_in.text())
            }
            res = requests.post(f"{API_URL}/analyze_axial", json=data).json()
            
            self.canvas.axes.clear()
            self.canvas.axes.plot(res["x"], res["delta"])
            self.canvas.axes.set_title("Elongation vs Length")
            self.canvas.axes.set_xlabel("Length (m)")
            self.canvas.axes.set_ylabel("Elongation (mm)")
            self.canvas.draw()
            
            self.res_lbl.setText(f"Max Stress: {res['sigma_max']:.2f} MPa\nMax Elongation: {res['delta_max']:.2f} mm")
        except Exception as e:
            self.res_lbl.setText(f"Error: {e}")

class PressureVesselTab(QWidget):
    def __init__(self):
        super().__init__()
        layout = QHBoxLayout(self)
        
        left = QVBoxLayout()
        form = QFormLayout()
        self.p_in = QLineEdit("5e6")
        self.r_in = QLineEdit("0.5")
        self.t_in = QLineEdit("0.01")
        self.type_cb = QComboBox()
        self.type_cb.addItems(["cylinder", "sphere"])
        self.thick_cb = QCheckBox("Thick-walled (Lamé)")
        
        form.addRow("Pressure (Pa):", self.p_in)
        form.addRow("Inner Radius (m):", self.r_in)
        form.addRow("Thickness (m):", self.t_in)
        form.addRow("Type:", self.type_cb)
        form.addRow("", self.thick_cb)
        left.addLayout(form)
        
        btn = QPushButton("Analyze")
        btn.clicked.connect(self.calculate)
        left.addWidget(btn)
        
        self.res_lbl = QLabel()
        left.addWidget(self.res_lbl)
        left.addStretch()
        layout.addLayout(left, 1)
        
        right = QVBoxLayout()
        self.canvas = MatplotlibCanvas()
        right.addWidget(self.canvas)
        layout.addLayout(right, 2)
        
    def calculate(self):
        try:
            data = {
                "p": float(self.p_in.text()), "r": float(self.r_in.text()),
                "t": float(self.t_in.text()), "type": self.type_cb.currentText(),
                "is_thick": self.thick_cb.isChecked()
            }
            res = requests.post(f"{API_URL}/analyze_pressure_vessel", json=data).json()
            
            self.canvas.axes.clear()
            if res["is_thick"]:
                self.canvas.axes.plot(res["r_vals"], res["sig_r"], label="Radial Stress")
                self.canvas.axes.plot(res["r_vals"], res["sig_theta"], label="Hoop Stress")
                self.canvas.axes.plot(res["r_vals"], res["sig_z"], label="Longitudinal Stress")
                self.canvas.axes.legend()
                self.canvas.axes.set_title("Stress vs Radius (Thick-Walled)")
            else:
                self.canvas.axes.text(0.5, 0.5, "Thin-walled:\nNo radial variation", ha='center', va='center')
                self.canvas.axes.set_title("Thin-Walled Vessel")
            self.canvas.draw()
            
            self.res_lbl.setText(f"Principal Stresses:\nS1: {res['s1']:.2f} MPa\nS2: {res['s2']:.2f} MPa\nMax Shear: {res['tmax']:.2f} MPa")
        except Exception as e:
            self.res_lbl.setText(f"Error: {e}")

class ThermalTab(QWidget):
    def __init__(self):
        super().__init__()
        layout = QHBoxLayout(self)
        left = QVBoxLayout()
        form = QFormLayout()
        self.dt_in = QLineEdit("50.0")
        self.l_in = QLineEdit("2.0")
        self.alpha_in = QLineEdit("1.2e-5")
        self.e_in = QLineEdit("200e9")
        self.const_cb = QComboBox()
        self.const_cb.addItems(["free", "fixed"])
        
        form.addRow("Delta T (K):", self.dt_in)
        form.addRow("Length (m):", self.l_in)
        form.addRow("Alpha (1/K):", self.alpha_in)
        form.addRow("E (Pa):", self.e_in)
        form.addRow("Constraint:", self.const_cb)
        left.addLayout(form)
        
        btn = QPushButton("Analyze")
        btn.clicked.connect(self.calculate)
        left.addWidget(btn)
        
        self.res_lbl = QLabel()
        left.addWidget(self.res_lbl)
        left.addStretch()
        layout.addLayout(left, 1)
        
        right = QVBoxLayout()
        self.canvas = MatplotlibCanvas()
        right.addWidget(self.canvas)
        layout.addLayout(right, 2)
        
    def calculate(self):
        try:
            data = {
                "dt": float(self.dt_in.text()), "L": float(self.l_in.text()),
                "alpha": float(self.alpha_in.text()), "E": float(self.e_in.text()),
                "constraint": self.const_cb.currentText()
            }
            res = requests.post(f"{API_URL}/analyze_thermal", json=data).json()
            
            self.canvas.axes.clear()
            self.canvas.axes.plot(res["x"], res["deflection"], marker='o')
            self.canvas.axes.set_title("Deflection Profile")
            self.canvas.axes.set_xlabel("Length (m)")
            self.canvas.axes.set_ylabel("Deflection (mm)")
            self.canvas.draw()
            
            self.res_lbl.setText(f"Stress: {res['sigma']:.2f} MPa\nDeflection: {res['delta']:.2f} mm")
        except Exception as e:
            self.res_lbl.setText(f"Error: {e}")

class SectionPropertiesTab(QWidget):
    def __init__(self):
        super().__init__()
        layout = QHBoxLayout(self)
        
        left = QVBoxLayout()
        form = QFormLayout()
        self.b_in = QLineEdit("0.1")
        self.h_in = QLineEdit("0.2")
        self.t_in = QLineEdit("0.01")
        form.addRow("Flange Width (m):", self.b_in)
        form.addRow("Web Height (m):", self.h_in)
        form.addRow("Thickness (m):", self.t_in)
        left.addLayout(form)
        
        btn = QPushButton("Analyze C-Channel")
        btn.clicked.connect(self.calculate)
        left.addWidget(btn)
        
        self.res_lbl = QLabel()
        left.addWidget(self.res_lbl)
        left.addStretch()
        layout.addLayout(left, 1)
        
        right = QVBoxLayout()
        self.canvas = MatplotlibCanvas()
        right.addWidget(self.canvas)
        layout.addLayout(right, 2)
        
    def calculate(self):
        try:
            data = {
                "shape": "c-channel",
                "b": float(self.b_in.text()), "h": float(self.h_in.text()), "t": float(self.t_in.text())
            }
            res = requests.post(f"{API_URL}/analyze_section", json=data).json()
            
            txt = f"Area: {res['Area']:.6f} m^2\n"
            txt += f"Centroid X: {res['centroid_x']:.6f} m\n"
            txt += f"Ix: {res['Ix']:.6e} m^4\n"
            txt += f"Shear Center e (from web): {res['shear_center_e']:.6f} m"
            self.res_lbl.setText(txt)
            
            # Basic drawing of C-channel
            self.canvas.axes.clear()
            b = float(self.b_in.text())
            h = float(self.h_in.text())
            t = float(self.t_in.text())
            self.canvas.axes.plot([0, b, b, t, t, b, b, 0, 0], [0, 0, t, t, h-t, h-t, h, h, 0], 'b-')
            self.canvas.axes.set_aspect('equal', adjustable='datalim')
            self.canvas.axes.set_title("C-Channel Layout")
            self.canvas.draw()
            
        except Exception as e:
            self.res_lbl.setText(f"Error: {e}")

class ColumnBucklingTab(QWidget):
    def __init__(self):
        super().__init__()
        layout = QHBoxLayout(self)
        
        left = QVBoxLayout()
        form = QFormLayout()
        self.e_in = QLineEdit("200e9")
        self.sy_in = QLineEdit("250e6")
        self.l_in = QLineEdit("3.0")
        self.i_in = QLineEdit("1e-5")
        self.a_in = QLineEdit("0.005")
        self.bc_cb = QComboBox()
        self.bc_cb.addItems(["pinned-pinned", "fixed-free", "fixed-pinned", "fixed-fixed"])
        
        form.addRow("E (Pa):", self.e_in)
        form.addRow("Sy (Pa):", self.sy_in)
        form.addRow("Length (m):", self.l_in)
        form.addRow("I (m^4):", self.i_in)
        form.addRow("Area (m^2):", self.a_in)
        form.addRow("Boundary:", self.bc_cb)
        left.addLayout(form)
        
        btn = QPushButton("Analyze")
        btn.clicked.connect(self.calculate)
        left.addWidget(btn)
        
        self.res_lbl = QLabel()
        left.addWidget(self.res_lbl)
        left.addStretch()
        layout.addLayout(left, 1)
        
        right = QVBoxLayout()
        self.canvas = MatplotlibCanvas()
        right.addWidget(self.canvas)
        layout.addLayout(right, 2)
        
    def calculate(self):
        try:
            data = {
                "E": float(self.e_in.text()), "Sy": float(self.sy_in.text()), "L": float(self.l_in.text()),
                "I": float(self.i_in.text()), "A": float(self.a_in.text()), "bc": self.bc_cb.currentText()
            }
            res = requests.post(f"{API_URL}/analyze_buckling", json=data).json()
            
            self.canvas.axes.clear()
            self.canvas.axes.plot(res["x"], res["mode_shape"])
            self.canvas.axes.set_title(f"Buckling Mode Shape ({res['regime']})")
            self.canvas.draw()
            
            self.res_lbl.setText(f"Critical Load: {res['Pcr']/1000:.2f} kN\nSlenderness Ratio: {res['slenderness']:.2f}\nRegime: {res['regime']}")
        except Exception as e:
            self.res_lbl.setText(f"Error: {e}")
