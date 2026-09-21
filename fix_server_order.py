with open('/home/srirammohan/Desktop/college/solid-mech-project/solid-mechanics-web/server.py', 'r') as f:
    lines = f.readlines()

new_lines = []
main_lines = []
in_main = False

for line in lines:
    if line.strip().startswith('if __name__ == "__main__":'):
        in_main = True
        main_lines.append(line)
    elif in_main:
        # Check if it's still part of the main block (indented)
        if line.startswith(' ') or line.startswith('\t') or line.strip() == '':
            main_lines.append(line)
        else:
            in_main = False
            new_lines.append(line)
    else:
        new_lines.append(line)

# Append main lines to the very end
new_lines.extend(main_lines)

with open('/home/srirammohan/Desktop/college/solid-mech-project/solid-mechanics-web/server.py', 'w') as f:
    f.writelines(new_lines)
