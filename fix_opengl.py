with open('/home/srirammohan/Desktop/college/solid-mech-project/solid_mechanics_app/src/gui/gl_widget.py', 'r') as f:
    content = f.read()

content = content.replace(
    'from PyQt6.QtWidgets import QOpenGLWidget', 
    'from PyQt6.QtOpenGLWidgets import QOpenGLWidget'
)

with open('/home/srirammohan/Desktop/college/solid-mech-project/solid_mechanics_app/src/gui/gl_widget.py', 'w') as f:
    f.write(content)
