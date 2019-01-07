uniform vec3 uCamPos;
varying float vIntensity;

void main() {
	vec3 surfaceNormal = normalize( normalMatrix * normal );
	vec3 cameraNormal = normalize( normalMatrix * uCamPos );

	vIntensity = pow( 1.0 - dot(surfaceNormal, cameraNormal), 2.5 );
	
	//vIntensity /= pow(dot(uCamPos, uCamPos) * 0.0000000000013, 3.5);

	gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}