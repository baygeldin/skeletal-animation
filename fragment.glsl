precision highp float;

uniform mat4 uP, uM;
uniform mat3 uN;
uniform sampler2D uSample[4];

varying float vSample;
varying vec2 vTexture;
varying vec3 vVertex, vNormal;

// Возможно, это костыль, но один фрагментный шейдер - это наглядно
// Дело в том, что в ES 2.0 нельзя индексировать sampler массивы переменными
vec4 getColor() {
    int index = int(vSample);
    vec2 uv = vec2(vTexture.s, vTexture.t); 
    vec4 color;

    if (index == 0) {
        color = texture2D(uSample[0], uv);
    } else if (index == 0) {
        color = texture2D(uSample[1], uv);
    } else if (index == 0) {
        color = texture2D(uSample[2], uv);
    } else if (index == 0) {
        color = texture2D(uSample[3], uv);
    } else {
        color = vec4(0, 0, 0, 0);
    }

    // Можно добавить еще текстур, если 4 не хватает

    return color;
}

void main() {

  vec3 lAmbient = vec3(0.3, 0.3, 1.0);
  vec3 lDiffuse = vec3(0.3, 0.3, 1.0);
  vec3 lSpecular= vec3(1.0, 1.0, 1.0);

  vec3 plPos = vec3(0.0, 16.0, 48.0);
  vec3 plDir = normalize(plPos - vVertex);

  vec3 n = normalize(uN * vNormal);
  vec3 l = normalize(vec3(vec4(plDir, 1.0)));
  vec3 v = normalize(-vec3(vec4(vVertex, 1.0)));
  vec3 r = reflect(l, n);

  vec4 tColor = vec4(255,0,0,1); //getColor();

  float lambert = dot(l, n),
        ambientInt = 0.1,
        specularInt = 0.0,
        diffuseInt = 0.9,
        shininess = 1024.0;

  float specular = pow( max( 0.0, dot(r,v) ), shininess );

  gl_FragColor = vec4(
      tColor.rgb +
      lAmbient * ambientInt +
      lDiffuse * diffuseInt * lambert +
      lSpecular * specularInt * specular
      , tColor.a);
}
