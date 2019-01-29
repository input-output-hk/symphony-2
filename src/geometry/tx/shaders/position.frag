#pragma glslify: random = require('../../../shaders/random')

varying vec2 vUv;

uniform sampler2D positionTexture;
uniform sampler2D defaultPositionTexture;

void main() {
  vec4 currentPosition;
  vec4 previousPosition = texture2D(positionTexture, vUv);
  vec4 defaultPosition = texture2D(defaultPositionTexture, vUv);

  if (previousPosition.w == 0.0 && defaultPosition.w == 0.0) {
     
      gl_FragColor = vec4(0.0);

   } else {

    if (previousPosition.w == 0.0 && defaultPosition.w == 1.0) {
      currentPosition = defaultPosition;
      previousPosition = defaultPosition;
    } else {
      currentPosition = previousPosition;
    }

    float distToCenter = length(-previousPosition.xz);

    if (distToCenter < 200000.0) {

      currentPosition.w = 0.0;

    } else {

        vec3 toCenter = normalize(-previousPosition.xyz);
        currentPosition.xyz += toCenter * (100.0 + (random(vUv.x) * 50.0));

        if (currentPosition.w < 2.0) {
          currentPosition.w += 0.002;
        }
    }

    gl_FragColor = currentPosition;
   }

}