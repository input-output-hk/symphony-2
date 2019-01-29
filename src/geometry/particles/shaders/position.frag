#pragma glslify: curlNoise = require('./curlNoise');

varying vec2 vUv;

uniform vec2 uOriginOffset;
uniform vec3 uSpawnStart;
uniform float uTime;
uniform float uDeltaTime;
uniform float uFrame;
uniform sampler2D positionTexture;
uniform sampler2D defaultPositionTexture;

void main() {
  vec4 defaultPosition = texture2D(defaultPositionTexture, vUv);
  vec4 currentPosition = texture2D(positionTexture, vUv);

  currentPosition.xyz = currentPosition.xyz + curlNoise(currentPosition.xyz * 0.0000025) * 300.8;

  currentPosition.w -= 1.0;
  if (currentPosition.w < 0.0 ) {
    currentPosition = defaultPosition;
    currentPosition.xyz += uSpawnStart;
  }

  gl_FragColor = currentPosition;

}