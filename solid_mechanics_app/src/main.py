import sys
from PyQt6.QtWidgets import QApplication, QMainWindow, QTabWidget, QVBoxLayout, QWidget
from gui.tabs import (
    PointStressTab, BeamTab, TorsionTab, AxialTab, PressureVesselTab,
    ThermalTab, SectionPropertiesTab, ColumnBucklingTab
)

class MainWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("Interactive Solid Mechanics Laboratory")
        self.resize(1200, 800)
        
        # Central widget and layout
        central_widget = QWidget()
        main_layout = QVBoxLayout()
        central_widget.setLayout(main_layout)
        self.setCentralWidget(central_widget)
        
        # Tabs
        self.tabs = QTabWidget()
        
        # Add Tabs
        self.tabs.addTab(PointStressTab(), "Point Stress")
        self.tabs.addTab(BeamTab(), "Beam Failure")
        self.tabs.addTab(TorsionTab(), "Shaft Torsion")
        self.tabs.addTab(AxialTab(), "Axial Loading")
        self.tabs.addTab(PressureVesselTab(), "Pressure Vessel")
        self.tabs.addTab(ThermalTab(), "Thermal Stress")
        self.tabs.addTab(SectionPropertiesTab(), "Section Properties")
        self.tabs.addTab(ColumnBucklingTab(), "Column Buckling")
        
        main_layout.addWidget(self.tabs)

if __name__ == '__main__':
    app = QApplication(sys.argv)
    window = MainWindow()
    window.show()
    sys.exit(app.exec())
