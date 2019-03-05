#pragma glslify: curlNoise = require('./curlNoise');

varying vec2 vUv;

uniform sampler2D positionTexture;
uniform sampler2D defaultPositionTexture;
uniform float uFrame;

void main() {
  vec4 defaultPosition = texture2D(defaultPositionTexture, vUv);
  vec4 currentPosition = texture2D(positionTexture, vUv);

  vec3 scaledPosition = vec3(currentPosition.x, currentPosition.y, currentPosition.z + (sin(uFrame * 0.001) * 100000.0)) * 0.0000045;

  currentPosition.xyz = currentPosition.xyz + curlNoise(scaledPosition) * 300.8;

  currentPosition.w -= 1.0;
  if (currentPosition.w < 0.0 ) {
    currentPosition = defaultPosition;
  }

  gl_FragColor = currentPosition;

}