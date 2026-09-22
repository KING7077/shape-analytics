import re

with open('/home/srirammohan/Desktop/college/solid-mech-project/solid-mechanics-web/app.js', 'r') as f:
    js = f.read()

# Add plane rendering logic to the end of updatePointApplication
plane_logic = '''
            while (axesGroup.children.length > 0) axesGroup.remove(axesGroup.children[0]);
            var axisColors = [0xff4d6a, 0x00e5a0, 0x6366f1];
            for (var i = 0; i < 3; i++) {
                var p = new THREE.Vector3(data.eigenvectors[0][i], data.eigenvectors[1][i], data.eigenvectors[2][i]).normalize();
                axesGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([p.clone().multiplyScalar(1.5), p.clone().multiplyScalar(-1.5)]), new THREE.LineBasicMaterial({ color: axisColors[i], linewidth: 3 })));
            }

            // Fracture Plane (Brittle failure plane is perpendicular to sigma_1)
            var s1_normal = new THREE.Vector3(data.eigenvectors[0][0], data.eigenvectors[1][0], data.eigenvectors[2][0]).normalize();
            var fracGeo = new THREE.PlaneGeometry(1.8, 1.8);
            var fracMat = new THREE.MeshBasicMaterial({color: 0xff4d6a, side: THREE.DoubleSide, transparent: true, opacity: 0.6});
            var fracPlane = new THREE.Mesh(fracGeo, fracMat);
            var q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,0,1), s1_normal);
            fracPlane.applyQuaternion(q);
            axesGroup.add(fracPlane);

            // Compute angles relative to global X (1,0,0)
            var angleBrittle = Math.acos(Math.abs(s1_normal.x)) * (180 / Math.PI);
            setText('pt-brittle-angle', angleBrittle.toFixed(1));
            // Ductile is 45 degrees to principal axes
            setText('pt-ductile-angle', (angleBrittle + 45).toFixed(1));
'''

js = re.sub(r'while \(axesGroup\.children\.length > 0\).*?\}\s*\} catch \(e\)', plane_logic + '        } catch (e)', js, flags=re.DOTALL)

with open('/home/srirammohan/Desktop/college/solid-mech-project/solid-mechanics-web/app.js', 'w') as f:
    f.write(js)
