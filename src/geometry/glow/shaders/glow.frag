#pragma glslify: snoise = require(glsl-noise/simplex/4d)

uniform vec3 uColor;
uniform float uTime;
varying float vIntensity;
varying vec3 vPos;

void main() {
	vec3 glow = uColor * vIntensity;

	vec4 noisePos = vec4(vPos, uTime * 100000.0);

	float noiseVal2 = 0.3 + snoise(noisePos * 0.000003);
	float noiseVal = 0.2 + abs(snoise(noisePos * 0.000004));

	gl_FragColor = vec4( glow, 1.0 );

	gl_FragColor.r *= noiseVal2;

	gl_FragColor.a *= noiseVal;

	//gl_FragColor.a *= (0.8 + (sin(uTime) + 1.0 * 0.5));
	// gl_FragColor.a *= (0.8);
}