(function() {

    // Инициализируем контекст WebGl
    var gl = (function() {

        var canvas = document.getElementById('canvas');
        var gl = canvas.getContext('webgl') || 
            canvas.getContext('experimental-webgl') || 
            console.log('WebGL не поддерживается!');

        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        
        // Установить координаты окна в canvas для WebGL
        gl.viewport(0, 0, canvas.width, canvas.height);

        // При изменении размеров окна, установить новые координаты
        window.addEventListener('resize', function() {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
            gl.viewport(0, 0, canvas.width, canvas.height);
        });

        return gl;

    }());

    // Компиляция шейдеров в контекст WebGL
    var program = (function(gl, attribs, uniforms) {

        var compileShader = function(source, type) {
            var xhr = new XMLHttpRequest();
            xhr.open('GET', source, false);
            xhr.send();

            var shader = gl.createShader(type);
            gl.shaderSource(shader, xhr.responseText);
            gl.compileShader(shader);

            return shader;
        }

        var program = gl.createProgram();
        gl.attachShader(program, compileShader('vertex.glsl', gl.VERTEX_SHADER));
        gl.attachShader(program, compileShader('fragment.glsl', gl.FRAGMENT_SHADER));

        gl.linkProgram(program);
        gl.useProgram(program);

        for (var i in attribs)
            program[attribs[i]] = gl.getAttribLocation(program, attribs[i]);

        for (var i in uniforms)
            program[uniforms[i]] = gl.getUniformLocation(program, uniforms[i]);

        return program;

    }(gl, ['aVertex', 'aNormal', 'aTexture', 'aSWeights', 'aSIndices', 'aSample'],
        ['uP', 'uV', 'uM', 'uN', 'uBones', 'uSample', 'uLightPos']));

    // Конструктор класса фигуры
    var Mesh = function(model) {

        this.geometry = model.geometry;
        this.keyframes = model.keyframes;
        this.materials = [];
        this._textures = {};

        function loadTexture (src) {
            if (this._textures[src])
                return this._textures[src];

            var image = new Image(); 
            var texture = { 
                id: Object.keys(this._textures).length, 
                sample: gl.createTexture(), 
                ready: false
            };
            image.src = src;
            image.onload = function() {
                // Загрузить текстуру в буффер видеокарты
                gl.bindTexture(gl.TEXTURE_2D, texture.sample);
                gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
                gl.bindTexture(gl.TEXTURE_2D, null);
                texture.ready = true;
            }

            return (this._textures[src] = texture);
        }

        for (var i=0; i<model.materials.length; i++)
            this.materials[i] = loadTexture.call(this, model.materials[i].texture);

        var indices = [], vertices = [], normals = [], uvs = [], textures = [];
        var skinIndices = [], skinWeights = [], face;

        // Парсинг структуры Three JS JSON Model Format
        for (var i=0; i*11<this.geometry.faces.length; i+=1) {
            faces = this.geometry.faces;
            for (var j=0; j<3; j++) {
                indices.push(i*3+j);
                textures.push(this.materials[faces[i*11+4]].id);
                vertices.push(this.geometry.vertices[faces[i*11+1+j] * 3]);
                vertices.push(this.geometry.vertices[faces[i*11+1+j] * 3 + 1]);
                vertices.push(this.geometry.vertices[faces[i*11+1+j] * 3 + 2]);
                uvs.push(this.geometry.uvs[faces[i*11+5+j] * 2]);
                uvs.push(this.geometry.uvs[faces[i*11+5+j] * 2 + 1]);
                normals.push(this.geometry.normals[faces[i*11+8+j] * 3]);
                normals.push(this.geometry.normals[faces[i*11+8+j] * 3 + 1]);
                normals.push(this.geometry.normals[faces[i*11+8+j] * 3 + 2]);
                skinIndices.push(this.geometry.skinIndices[faces[i*11+1+j] * 2]);
                skinIndices.push(this.geometry.skinIndices[faces[i*11+1+j] * 2 + 1]);
                skinWeights.push(this.geometry.skinWeights[faces[i*11+1+j] * 2]);
                skinWeights.push(this.geometry.skinWeights[faces[i*11+1+j] * 2 + 1]);
            }
        }
        
        this._vertexBuffer = gl.createBuffer();
        this._indexBuffer = gl.createBuffer();
        this._normalBuffer = gl.createBuffer();
        this._uvsBuffer = gl.createBuffer();
        this._skinIndicesBuffer = gl.createBuffer();
        this._skinWeightsBuffer = gl.createBuffer();
        this._texturesBuffer = gl.createBuffer();

        for (var i = 0; i < this.geometry.bones.length; i++) {
            var bone = this.geometry.bones[i];
            bone.inverseBindpose = mat4.create();
            this._adjustBone(bone, bone.rot, bone.pos);
            mat4.invert(bone.inverseBindpose, bone.worldMatrix);
        }

        // Хранят состояние модели (кадр и параметр интерполяции)
        this.curFrame = this.curLerp = 0;

        // Инициализируем буферы видеокарты
        gl.bindBuffer(gl.ARRAY_BUFFER, this._vertexBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);
        gl.bindBuffer(gl.ARRAY_BUFFER, this._normalBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(normals), gl.STATIC_DRAW);
        gl.bindBuffer(gl.ARRAY_BUFFER, this._uvsBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(uvs), gl.STATIC_DRAW);
        gl.bindBuffer(gl.ARRAY_BUFFER, this._skinWeightsBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(skinWeights), gl.STATIC_DRAW);
        gl.bindBuffer(gl.ARRAY_BUFFER, this._skinIndicesBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(skinIndices), gl.STATIC_DRAW);
        gl.bindBuffer(gl.ARRAY_BUFFER, this._texturesBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(textures), gl.STATIC_DRAW);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this._indexBuffer);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), gl.STATIC_DRAW);
        gl.bindBuffer(gl.ARRAY_BUFFER, null);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
    }

    // Алгоритм скелетной анимации
    Mesh.prototype._adjustBone = function(bone, rot, pos) {
        bone.worldMatrix = mat4.create();
        bone.localMatrix = mat4.create();

        // Считаем локальную матрицу для одной кости
        mat4.fromRotationTranslation(bone.localMatrix, rot, pos);

        if (bone.parent === -1) {
            // Если кость корневая, то значит ее локальная матрица уже в мировых координатах
            mat4.copy(bone.worldMatrix, bone.localMatrix)
        } else {
            // А если нет, то перемножим ее на матрицу родительской кости
            mat4.multiply(bone.worldMatrix, 
                this.geometry.bones[bone.parent].worldMatrix, bone.localMatrix)
        }
    }

    Mesh.prototype.getKeyframe = function() {
        // Прибавляем кадр каждый раз, когда параметр интерполяции достигает 1
        while (this.curLerp > 1) {
            this.curLerp -= 1.0;
            this.curFrame++;
        }

        var flat = [];

        // Берем предыдущий и следующий кадр из анимации
        var prevFrame = this.keyframes[this.curFrame % this.keyframes.length];
        var nextFrame = this.keyframes[(this.curFrame + 1) % this.keyframes.length];

        for (var i = 0; i < this.geometry.bones.length; i++) {
            var bone = this.geometry.bones[i];
            var prevBone = prevFrame[i], nextBone = nextFrame[i];
            var offsetMatrix = mat4.create(), lquat = quat.create(), lvec = vec3.create();

            // Считаем промежуточное значение поворота и позиции кости между двумя кадрами
            // Для повотора - сферическая интерполяция, для положения - линейная
            quat.slerp(lquat, prevBone.rot, nextBone.rot, this.curLerp);
            vec3.lerp(lvec, prevBone.pos, nextBone.pos, this.curLerp);

            this._adjustBone(bone, lquat, lvec);
            mat4.multiply(offsetMatrix, bone.worldMatrix, bone.inverseBindpose);

            flat.push.apply(flat, offsetMatrix);
        }

        return new Float32Array(flat);
    }

    Mesh.prototype.draw = function() {
        var mvMatrix = mat4.create();
        var nMatrix = mat3.create();

        // Создаем матрицу модели
        mat4.identity(mvMatrix);
        mat4.translate(mvMatrix, mvMatrix, this.geometry.position);
        mat4.rotate(mvMatrix, mvMatrix, this.geometry.rotate[0], [1.0, 0.0, 0.0]);
        mat4.rotate(mvMatrix, mvMatrix, this.geometry.rotate[1], [0.0, 1.0, 0.0]);
        mat4.rotate(mvMatrix, mvMatrix, this.geometry.rotate[2], [0.0, 0.0, 1.0]);
        mat4.scale(mvMatrix, mvMatrix, this.geometry.scale);

        mat3.normalFromMat4(nMatrix, mvMatrix);

        gl.uniformMatrix4fv(program.uBones, false, this.getKeyframe());

        gl.uniformMatrix4fv(program.uM, false, mvMatrix);
        gl.uniformMatrix3fv(program.uN, false, nMatrix);

        var uSample = [];
        for (var key in this._textures) {
            if (this._textures[key].ready) {
               gl.activeTexture(gl['TEXTURE'+this._textures[key].id]);
               gl.bindTexture(gl.TEXTURE_2D, this._textures[key].sample); 
            }
            uSample.push(this._textures[key].id);
        }
        gl.uniform1iv(program.uSample, uSample);

        gl.bindBuffer(gl.ARRAY_BUFFER, this._vertexBuffer);
        gl.vertexAttribPointer(program.aVertex, 3, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(program.aVertex);

        gl.bindBuffer(gl.ARRAY_BUFFER, this._normalBuffer);
        gl.vertexAttribPointer(program.aNormal, 3, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(program.aNormal);

        gl.bindBuffer(gl.ARRAY_BUFFER, this._uvsBuffer);
        gl.vertexAttribPointer(program.aTexture, 2, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(program.aTexture);

        // Для каждой вершины есть только две кости, от которых она зависит
        // В абсолютном большинстве случаев - этого достаточно
        gl.bindBuffer(gl.ARRAY_BUFFER, this._skinWeightsBuffer);
        gl.vertexAttribPointer(program.aSWeights, 2, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(program.aSWeights);

        gl.bindBuffer(gl.ARRAY_BUFFER, this._skinIndicesBuffer);
        gl.vertexAttribPointer(program.aSIndices, 2, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(program.aSIndices);
        
        gl.bindBuffer(gl.ARRAY_BUFFER, this._texturesBuffer);
        gl.vertexAttribPointer(program.aSample, 1, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(program.aSample);

        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this._indexBuffer);
        gl.drawElements(gl.TRIANGLES, 
            Math.floor(this.geometry.faces.length / 11) * 3, gl.UNSIGNED_SHORT, 0);

        gl.bindBuffer(gl.ARRAY_BUFFER, null);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
    }

    // Очистить экран и залить его черным
    gl.clearColor(0.0, 0.0, 0.0, 1.0);
    // Учитывать расположение объектов по оси Z при рендеринге 
    gl.enable(gl.DEPTH_TEST);

    // Создать экземпляр фигуры из описания модели
    var mesh = new Mesh((function() {

        var xhr = new XMLHttpRequest();
        xhr.open('GET', 'model.json', false);
        xhr.send();

        var data = JSON.parse(xhr.responseText);
        
        // Приведение данных в соответствии с нашей моделью (убираем лишнее)
        var model = {
            geometry: {
                uvs: data.uvs[0],
                faces: data.faces,
                skinIndices: data.skinIndices,
                skinWeights: data.skinWeights,
                vertices: data.vertices,
                normals: data.normals,
                bones: []
            },
            materials: [],
            keyframes: []
        };

        for (var i=0; i<data.materials.length; i++)
            model.materials[i] = { texture: 'samples/'+data.materials[i].mapDiffuse };

        for (var i=0; i<data.bones.length; i++) {
            model.geometry.bones[i] = { 
                parent: data.bones[i].parent, 
                pos: data.bones[i].pos,
                rot: data.bones[i].rotq
            };
        }

        // От костей из кадров, до кадров из костей...
        for (var i=0, bones = data.animations[0].hierarchy; i<bones.length; i++) {
            for (var j=0; j<bones[i].keys.length; j++) {
                if (!model.keyframes[j]) model.keyframes[j] = [];
                model.keyframes[j][i] = { pos: bones[i].keys[j].pos, rot: bones[i].keys[j].rot };
            }
        }

        // Начальные параметры фигуры (для матрицы модели)
        model.geometry.position = [0, -5, 0];
        model.geometry.rotate = [0, 0, 0];
        model.geometry.scale = [1, 1, 1];
        
        return model;

    }()));

    var moving = false;

    // Интерфейс
    (function(){
        var capture = false, lastX, lastY;

        // Упраление матрицей вида с помощью мышки
        document.addEventListener('mousedown', function (event) {
            if (event.which === 1)
                capture = true;
            lastX = event.pageX;
            lastY = event.pageY;
        });

        document.addEventListener('mousemove', function (event) {
            if (capture) {
                var deltaX = event.pageX - lastX;
                var deltaY = event.pageY - lastY;

                lastX = event.pageX;
                lastY = event.pageY;
                orbitX += deltaY * 0.005;
                orbitY += deltaX * 0.005;
            }
        });

        document.addEventListener('mouseup', function () {
            capture = false;
        });

        document.addEventListener('wheel', function (event) {
            distance += event.deltaY * 0.005;
        });

        // Управляем движением модели
        document.addEventListener('keydown', function(event) {
            switch(event.code) {
                case 'Space':
                    moving = !moving;
                    break;
                default: break;
            }
        });
    }());

    var uP = mat4.create(), distance = 30, orbitX = 0, orbitY = 0;

    // Создаем матрицу перспективной проекции
    mat4.perspective(uP, 45 / 180 * Math.PI, 
        window.innerWidth / window.innerHeight, 0.01, 500.0);

    (function animate(time) {

        // Считаем разницу между временем последней отрисовки и настоящим моментом
        var delta = time - (animate.timeOld || time);

        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        // Экспортируем перспективную матрицу
        gl.uniformMatrix4fv(program.uP, false, uP);

        // Создаем и экспортируем матрицу вида
        uV = mat4.create();
        mat4.identity(uV);
        mat4.rotate(uV, uV, orbitX, [1.0, 0.0, 0.0]);
        mat4.rotate(uV, uV, orbitY, [0.0, 1.0, 0.0]);
        mat4.translate(uV, uV, [0, 0, -distance]);
        gl.uniformMatrix4fv(program.uV, false, uV);

        // Настраиваем источник освещение (в координатах модели)
        gl.uniform3f(program.uLightPos, 0, -10, distance);

        mesh.draw();
        
        if (moving)
            mesh.curLerp += 0.005 * delta;

        // Запомнить время в настоящий момент
        animate.timeOld = time;

        // Вызвать функцию еще раз, когда есть ресурсы (видеокарты свободна)
        // Этот метод гораздо лучше setInterval
        requestAnimationFrame(animate);
        
    }(0));

}());
