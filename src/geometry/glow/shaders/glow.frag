uniform vec3 uColor;
uniform float uTime;
varying float vIntensity;

void main() {
	vec3 glow = uColor * vIntensity;
	gl_FragColor = vec4( glow, 1.0 );
	gl_FragColor.a *= (0.8 + (sin(uTime) + 1.0 * 0.5));
}