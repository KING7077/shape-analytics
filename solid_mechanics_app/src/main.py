import sys
import numpy as np
from PyQt6.QtWidgets import (QApplication, QMainWindow, QWidget, QVBoxLayout, 
                             QHBoxLayout, QGridLayout, QLabel, QLineEdit, QPushButton, QGroupBox)
from PyQt6.QtCore import Qt
from gui.gl_widget import GLStressCubeWidget
from gui.mohr_widget import MohrCircleWidget
from math_engine.tensor_math import get_mohr_circle_parameters

class MainWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("Interactive Solid Mechanics Laboratory")
        self.resize(1200, 800)
        
        # Central widget and layout
        central_widget = QWidget()
        main_layout = QHBoxLayout()
        central_widget.setLayout(main_layout)
        self.setCentralWidget(central_widget)
        
        # Left Panel (Inputs)
        left_panel = QVBoxLayout()
        self.setup_input_panel(left_panel)
        main_layout.addLayout(left_panel, 1)
        
        # Middle Panel (3D OpenGL View)
        middle_panel = QVBoxLayout()
        self.gl_widget = GLStressCubeWidget()
        middle_panel.addWidget(QLabel("3D Stress State (PyOpenGL)"))
        middle_panel.addWidget(self.gl_widget)
        main_layout.addLayout(middle_panel, 2)
        
        # Right Panel (2D Mohr's Circle View)
        right_panel = QVBoxLayout()
        self.mohr_widget = MohrCircleWidget()
        right_panel.addWidget(QLabel("Mohr's Circle (Matplotlib)"))
        right_panel.addWidget(self.mohr_widget)
        main_layout.addLayout(right_panel, 2)
        
        # Initialize default plot
        self.calculate_stresses()

    def setup_input_panel(self, layout):
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
                    else: line_edit.setText("0.0")
                grid.addWidget(line_edit, i, j)
                row.append(line_edit)
            self.inputs.append(row)
            
        group_box.setLayout(grid)
        layout.addWidget(group_box)
        
        calc_button = QPushButton("Calculate & Update")
        calc_button.clicked.connect(self.calculate_stresses)
        layout.addWidget(calc_button)
        layout.addStretch()

    def calculate_stresses(self):
        try:
            tensor = np.zeros((3, 3))
            for i in range(3):
                for j in range(3):
                    tensor[i, j] = float(self.inputs[i][j].text())
            
            # Use math engine
            mohr_params = get_mohr_circle_parameters(tensor)
            
            # Update 2D view
            self.mohr_widget.update_plot(
                mohr_params["C12"], mohr_params["R12"],
                mohr_params["C23"], mohr_params["R23"],
                mohr_params["C13"], mohr_params["R13"],
                mohr_params["principal_stresses"]
            )
            
            # In a full implementation, we'd pass principal stresses or rotated matrix to GL_widget
            # For the MVP, we just trigger a redraw
            self.gl_widget.update()
            
        except ValueError:
            print("Invalid input. Please enter numbers.")

if __name__ == '__main__':
    app = QApplication(sys.argv)
    window = MainWindow()
    window.show()
    sys.exit(app.exec())
