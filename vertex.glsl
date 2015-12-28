uniform mat4 uP, uM, uV;
uniform mat4 uBones[32];

attribute float aSample;
attribute vec2 aTexture;
attribute vec3 aVertex, aNormal;
attribute highp vec2 aSWeights;
attribute highp vec2 aSIndices;

varying float vSample;
varying vec2 vTexture;
varying vec3 vVertex, vNormal;

mat4 boneTransform() {
  mat4 ret;

  // Сумма весов должна равнятся 1, поэтому нормализуем
  float normfac = 1.0 / (aSWeights.x + aSWeights.y);
  ret = normfac * aSWeights.y * uBones[int(aSIndices.y)]
      + normfac * aSWeights.x * uBones[int(aSIndices.x)];

  return ret;
}

void main() {

  mat4 bt = boneTransform();

  // uP - матрица перспективного отображения
  // uM - матрица вида (из координат мира в координаты камеры)
  // uM - матрица модели (из координат модели в мировые)
  // bt - афинное преобразование, основанное на положениях костей

  gl_Position = uP * uV * uM * bt * vec4(aVertex, 1.0);
  vVertex = (bt * vec4(aVertex, 1.0)).xyz;
  vNormal = (bt * vec4(aNormal, 0.0)).xyz;
  vTexture = aTexture;
  vSample = aSample;

}
