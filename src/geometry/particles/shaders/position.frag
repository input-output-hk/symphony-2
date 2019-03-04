#pragma glslify: curlNoise = require('./curlNoise');

varying vec2 vUv;

uniform sampler2D positionTexture;
uniform sampler2D defaultPositionTexture;

void main() {
  vec4 defaultPosition = texture2D(defaultPositionTexture, vUv);
  vec4 currentPosition = texture2D(positionTexture, vUv);

  currentPosition.xyz = currentPosition.xyz + curlNoise(currentPosition.xyz * 0.0000045) * 300.8;

  currentPosition.w -= 1.0;
  if (currentPosition.w < 0.0 ) {
    currentPosition = defaultPosition;
  }

  gl_FragColor = currentPosition;

}