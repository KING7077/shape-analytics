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
    app.setStyleSheet("""
    * {
        font-family: 'Segoe UI', Arial, sans-serif;
    }
    QMainWindow, QWidget {
        background-color: #04070d;
        color: #e2e8f0;
    }
    QTabWidget::pane {
        border: 1px solid #1a2233;
        background: #080c16;
    }
    QTabBar::tab {
        background: #0a0f1c;
        color: #60728c;
        padding: 10px 20px;
        border: 1px solid #1a2233;
        border-bottom-color: #1a2233;
    }
    QTabBar::tab:selected {
        background: #04070d;
        color: #00e5a0;
        border-bottom-color: #04070d;
        font-weight: bold;
    }
    QGroupBox {
        border: 1px solid #1a2233;
        border-radius: 6px;
        margin-top: 1ex;
        font-weight: bold;
        color: #00e5a0;
    }
    QGroupBox::title {
        subcontrol-origin: margin;
        left: 10px;
        padding: 0 3px;
    }
    QLabel {
        color: #94a3b8;
    }
    QLineEdit, QComboBox {
        background-color: #0a0f1c;
        border: 1px solid #1a2233;
        color: #e2e8f0;
        padding: 5px;
        border-radius: 4px;
        font-family: 'JetBrains Mono', monospace;
    }
    QPushButton {
        background-color: #00e5a0;
        color: #04070d;
        border: none;
        padding: 8px 16px;
        border-radius: 4px;
        font-weight: bold;
    }
    QPushButton:hover {
        background-color: #00ffb3;
    }
    QTableWidget {
        background-color: #080c16;
        alternate-background-color: #0a0f1c;
        color: #e2e8f0;
        gridline-color: #1a2233;
    }
    QHeaderView::section {
        background-color: #0a0f1c;
        color: #00e5a0;
        padding: 4px;
        border: 1px solid #1a2233;
    }
""")
    window = MainWindow()
    window.show()
    sys.exit(app.exec())
