#pragma glslify: noise = require('glsl-noise/simplex/4d');

varying vec2 vUv;

uniform vec2 uOriginOffset;

uniform sampler2D positionTexture;

void main() {
  vec4 currentPosition = texture2D(positionTexture, vUv);

  float noiseVec = noise(vec4(currentPosition.xyz * 0.01, 0.0));

  currentPosition += noiseVec;

  //vec3 newPos = vec3(0.);

  //newPos = currentPosition.xyz + 100.0;

  //vec3 finalPos = mix(currentPosition.xyz, newPos, 0.5);

  currentPosition.xz -= normalize(uOriginOffset - currentPosition.xz);

  gl_FragColor = vec4(currentPosition.xyz, 1.);

}