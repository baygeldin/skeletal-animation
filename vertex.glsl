uniform mat4 uP, uM;
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

  // Собственно сами вершины, которые создают полигоны
  // uP - матрица перспективного отображения
  // uM - матрица модель-вид
  // bt - афинное преобразование, основанное на положениях костей

  gl_Position = uP * uM * bt * vec4(aVertex, 1.0);
  vVertex = (bt * vec4(aVertex, 1.0)).xyz;
  vNormal = (bt * vec4(aNormal, 0.0)).xyz;
  vTexture = aTexture;
  vSample = aSample;

}
