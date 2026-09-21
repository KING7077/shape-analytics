from PyQt6.QtWidgets import QWidget, QVBoxLayout
from matplotlib.backends.backend_qtagg import FigureCanvasQTAgg as FigureCanvas
from matplotlib.figure import Figure
import numpy as np

class MohrCircleWidget(QWidget):
    def __init__(self, parent=None):
        super().__init__(parent)
        self.figure = Figure(figsize=(5, 4), dpi=100)
        self.canvas = FigureCanvas(self.figure)
        self.ax = self.figure.add_subplot(111)
        
        layout = QVBoxLayout()
        layout.addWidget(self.canvas)
        self.setLayout(layout)
        
        self.update_plot(0, 0, 0, 0, 0, 0, [0, 0, 0])
        
    def update_plot(self, c12, r12, c23, r23, c13, r13, ps):
        self.ax.clear()
        
        # Plot the three circles
        theta = np.linspace(0, np.pi, 100)
        
        if r13 > 0: # Ensure there is some stress to plot
            # Circle 13 (Outer)
            x13 = c13 + r13 * np.cos(theta)
            y13 = r13 * np.sin(theta)
            self.ax.plot(x13, y13, 'b-', label='$\sigma_1 - \sigma_3$')
            self.ax.fill_between(x13, 0, y13, color='blue', alpha=0.1)
            
            # Circle 12
            x12 = c12 + r12 * np.cos(theta)
            y12 = r12 * np.sin(theta)
            self.ax.plot(x12, y12, 'r-', label='$\sigma_1 - \sigma_2$')
            self.ax.fill_between(x12, 0, y12, color='white')
            
            # Circle 23
            x23 = c23 + r23 * np.cos(theta)
            y23 = r23 * np.sin(theta)
            self.ax.plot(x23, y23, 'g-', label='$\sigma_2 - \sigma_3$')
            self.ax.fill_between(x23, 0, y23, color='white')
            
            # Principal stresses on x-axis
            self.ax.plot(ps, [0,0,0], 'ko')
            for i, p in enumerate(ps):
                self.ax.text(p, -r13*0.05, f'$\sigma_{i+1}$', verticalalignment='top')
                
        self.ax.axhline(0, color='black', linewidth=1)
        self.ax.axvline(0, color='black', linewidth=1)
        self.ax.set_xlabel('Normal Stress $\sigma$')
        self.ax.set_ylabel('Shear Stress $\tau$')
        self.ax.set_title("Mohr's Circles for 3D Stress State")
        self.ax.grid(True, linestyle='--', alpha=0.6)
        
        # Ensure aspect ratio is equal so circles aren't squished
        self.ax.set_aspect('equal', adjustable='datalim')
        
        if r13 > 0:
            self.ax.legend()
            
        self.canvas.draw()
