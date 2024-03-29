

uniform vec3 diffuse;
uniform float opacity;
uniform float uTime;
uniform float uParticleLifeMax;

varying float vLife;
varying float vLifeAttr;

#include <common>
#include <color_pars_fragment>
#include <map_particle_pars_fragment>
// #include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>

void main() {

	#include <clipping_planes_fragment>

	vec3 outgoingLight = vec3( 0.0 );
	vec4 diffuseColor = vec4( diffuse, opacity );

	#include <logdepthbuf_fragment>
	#include <map_particle_fragment>
	#include <color_fragment>
	#include <alphatest_fragment>

	outgoingLight = diffuseColor.rgb;

	// round particles
	// vec2 uv = (  vec3( gl_PointCoord.x, 1.0 - gl_PointCoord.y, 1 ) ).xy;
	// vec2 toCenter = (uv - 0.5) * 2.0;
	// if (length(toCenter) > 1.0) {
	// 	discard;
	// }

	// outgoingLight *= vec3(112./255., 158./255., 236./255.);
	outgoingLight.r += (vLife / uParticleLifeMax) * 0.25;
	// diffuseColor.a = (vLife / uParticleLifeMax) * (vLife / uParticleLifeMax);
	// diffuseColor.a *= 1.0 - (vLife / uParticleLifeMax);

	gl_FragColor = vec4( outgoingLight, diffuseColor.a );

	#include <tonemapping_fragment>
	#include <encodings_fragment>
	//#include <fog_fragment>

}
