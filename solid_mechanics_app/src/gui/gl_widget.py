from PyQt6.QtWidgets import QOpenGLWidget
from PyQt6.QtCore import Qt
from OpenGL.GL import *
from OpenGL.GLU import *

class GLStressCubeWidget(QOpenGLWidget):
    def __init__(self, parent=None):
        super().__init__(parent)
        self.xRot = 30
        self.yRot = 30
        self.zRot = 0

    def initializeGL(self):
        glClearColor(0.1, 0.1, 0.1, 1.0) # Dark gray background
        glEnable(GL_DEPTH_TEST)
        glEnable(GL_CULL_FACE)

    def resizeGL(self, w, h):
        glViewport(0, 0, w, h)
        glMatrixMode(GL_PROJECTION)
        glLoadIdentity()
        gluPerspective(45.0, w / float(h if h > 0 else 1), 0.1, 100.0)
        glMatrixMode(GL_MODELVIEW)

    def paintGL(self):
        glClear(GL_COLOR_BUFFER_BIT | GL_DEPTH_BUFFER_BIT)
        glLoadIdentity()
        glTranslatef(0.0, 0.0, -5.0)
        
        # Rotate based on user input
        glRotatef(self.xRot, 1.0, 0.0, 0.0)
        glRotatef(self.yRot, 0.0, 1.0, 0.0)
        glRotatef(self.zRot, 0.0, 0.0, 1.0)

        self.draw_axes()
        self.draw_cube()

    def draw_axes(self):
        glLineWidth(2.0)
        glBegin(GL_LINES)
        
        # X axis (Red)
        glColor3f(1.0, 0.0, 0.0)
        glVertex3f(0.0, 0.0, 0.0)
        glVertex3f(1.5, 0.0, 0.0)
        
        # Y axis (Green)
        glColor3f(0.0, 1.0, 0.0)
        glVertex3f(0.0, 0.0, 0.0)
        glVertex3f(0.0, 1.5, 0.0)
        
        # Z axis (Blue)
        glColor3f(0.0, 0.5, 1.0)
        glVertex3f(0.0, 0.0, 0.0)
        glVertex3f(0.0, 0.0, 1.5)
        
        glEnd()

    def draw_cube(self):
        glBegin(GL_QUADS)
        
        # Front face (Z+)
        glColor3f(0.5, 0.5, 0.5) # Gray
        glVertex3f(-0.5, -0.5,  0.5)
        glVertex3f( 0.5, -0.5,  0.5)
        glVertex3f( 0.5,  0.5,  0.5)
        glVertex3f(-0.5,  0.5,  0.5)
        
        # Back face (Z-)
        glColor3f(0.4, 0.4, 0.4)
        glVertex3f(-0.5, -0.5, -0.5)
        glVertex3f(-0.5,  0.5, -0.5)
        glVertex3f( 0.5,  0.5, -0.5)
        glVertex3f( 0.5, -0.5, -0.5)
        
        # Top face (Y+)
        glColor3f(0.6, 0.6, 0.6)
        glVertex3f(-0.5,  0.5, -0.5)
        glVertex3f(-0.5,  0.5,  0.5)
        glVertex3f( 0.5,  0.5,  0.5)
        glVertex3f( 0.5,  0.5, -0.5)
        
        # Bottom face (Y-)
        glColor3f(0.3, 0.3, 0.3)
        glVertex3f(-0.5, -0.5, -0.5)
        glVertex3f( 0.5, -0.5, -0.5)
        glVertex3f( 0.5, -0.5,  0.5)
        glVertex3f(-0.5, -0.5,  0.5)
        
        # Right face (X+)
        glColor3f(0.55, 0.55, 0.55)
        glVertex3f( 0.5, -0.5, -0.5)
        glVertex3f( 0.5,  0.5, -0.5)
        glVertex3f( 0.5,  0.5,  0.5)
        glVertex3f( 0.5, -0.5,  0.5)
        
        # Left face (X-)
        glColor3f(0.45, 0.45, 0.45)
        glVertex3f(-0.5, -0.5, -0.5)
        glVertex3f(-0.5, -0.5,  0.5)
        glVertex3f(-0.5,  0.5,  0.5)
        glVertex3f(-0.5,  0.5, -0.5)
        
        glEnd()
        
        # Draw edges for visibility
        glLineWidth(1.0)
        glColor3f(1.0, 1.0, 1.0) # White edges
        
        # This is a simplified way to draw the wireframe on top of the solid
        glPolygonMode(GL_FRONT_AND_BACK, GL_LINE)
        self._draw_cube_verts()
        glPolygonMode(GL_FRONT_AND_BACK, GL_FILL)

    def _draw_cube_verts(self):
        glBegin(GL_QUADS)
        glVertex3f(-0.5, -0.5,  0.5)
        glVertex3f( 0.5, -0.5,  0.5)
        glVertex3f( 0.5,  0.5,  0.5)
        glVertex3f(-0.5,  0.5,  0.5)
        glVertex3f(-0.5, -0.5, -0.5)
        glVertex3f(-0.5,  0.5, -0.5)
        glVertex3f( 0.5,  0.5, -0.5)
        glVertex3f( 0.5, -0.5, -0.5)
        glVertex3f(-0.5,  0.5, -0.5)
        glVertex3f(-0.5,  0.5,  0.5)
        glVertex3f( 0.5,  0.5,  0.5)
        glVertex3f( 0.5,  0.5, -0.5)
        glVertex3f(-0.5, -0.5, -0.5)
        glVertex3f( 0.5, -0.5, -0.5)
        glVertex3f( 0.5, -0.5,  0.5)
        glVertex3f(-0.5, -0.5,  0.5)
        glVertex3f( 0.5, -0.5, -0.5)
        glVertex3f( 0.5,  0.5, -0.5)
        glVertex3f( 0.5,  0.5,  0.5)
        glVertex3f( 0.5, -0.5,  0.5)
        glVertex3f(-0.5, -0.5, -0.5)
        glVertex3f(-0.5, -0.5,  0.5)
        glVertex3f(-0.5,  0.5,  0.5)
        glVertex3f(-0.5,  0.5, -0.5)
        glEnd()

    def mousePressEvent(self, event):
        self.lastPos = event.position()

    def mouseMoveEvent(self, event):
        dx = event.position().x() - self.lastPos.x()
        dy = event.position().y() - self.lastPos.y()

        if event.buttons() & Qt.MouseButton.LeftButton:
            self.xRot += dy
            self.yRot += dx
            self.update()

        self.lastPos = event.position()
