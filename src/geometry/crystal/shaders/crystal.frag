#pragma glslify: noise = require('glsl-noise/simplex/4d');
#pragma glslify: random = require('../../../shaders/random')
#pragma glslify: truchetPattern = require('../../../shaders/truchetPattern')

#define PHYSICAL

uniform vec3 diffuse;
uniform vec3 emissive;
uniform float roughness;
uniform float metalness;
uniform float opacity;
uniform float uTime;
uniform float uCamPosYPositive;

varying float vIsSelected;
varying float vIsHovered;
varying vec3 vBarycentric;
varying vec3 vTransformed;
varying vec3 vOffset;
varying float vScale;
varying float vTopVertex;
varying float vBottomVertex;
// varying float vCenterTopVertex;
// varying float vCenterBottomVertex;
varying float vEnvelope;
varying vec4 vWorldPosition;

#ifndef STANDARD
	uniform float clearCoat;
	uniform float clearCoatRoughness;
#endif

varying vec3 vViewPosition;
varying float vSpentRatio;

// #ifndef FLAT_SHADED

	varying vec3 vNormal;

// #endif

#include <common>
#include <packing>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <uv2_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <emissivemap_pars_fragment>
#include <bsdfs>
#include <cube_uv_reflection_fragment>
#include <envmap_pars_fragment>
// #include <envmap_physical_pars_fragment>

#if defined( USE_ENVMAP ) && defined( PHYSICAL )

	


	vec3 getLightProbeIndirectIrradiance( /*const in SpecularLightProbe specularLightProbe,*/ const in GeometricContext geometry, const in int maxMIPLevel ) {

		float envMapIntensityVar = envMapIntensity * (1.0-vSpentRatio);

		vec3 worldNormal = inverseTransformDirection( geometry.normal, viewMatrix );

	

			vec3 queryVec = vec3( flipEnvMap * worldNormal.x, worldNormal.yz );

			// TODO: replace with properly filtered cubemaps and access the irradiance LOD level, be it the last LOD level
			// of a specular cubemap, or just the default level of a specially created irradiance cubemap.

			#ifdef TEXTURE_LOD_EXT

				vec4 envMapColor = textureCubeLodEXT( envMap, queryVec, float( maxMIPLevel ) );

			#else

				// force the bias high to get the last LOD level as it is the most blurred.
				vec4 envMapColor = textureCube( envMap, queryVec, float( maxMIPLevel ) );

			#endif

			envMapColor.rgb = envMapTexelToLinear( envMapColor ).rgb;


	

		return PI * envMapColor.rgb * envMapIntensityVar;

	}

	// taken from here: http://casual-effects.blogspot.ca/2011/08/plausible-environment-lighting-in-two.html
	float getSpecularMIPLevel( const in float blinnShininessExponent, const in int maxMIPLevel ) {

		//float envMapWidth = pow( 2.0, maxMIPLevelScalar );
		//float desiredMIPLevel = log2( envMapWidth * sqrt( 3.0 ) ) - 0.5 * log2( pow2( blinnShininessExponent ) + 1.0 );

		float maxMIPLevelScalar = float( maxMIPLevel );
		float desiredMIPLevel = maxMIPLevelScalar + 0.79248 - 0.5 * log2( pow2( blinnShininessExponent ) + 1.0 );

		// clamp to allowable LOD ranges.
		return clamp( desiredMIPLevel, 0.0, maxMIPLevelScalar );

	}

	vec3 getLightProbeIndirectRadiance( /*const in SpecularLightProbe specularLightProbe,*/ const in GeometricContext geometry, const in float blinnShininessExponent, const in int maxMIPLevel ) {

		float envMapIntensityVar = envMapIntensity * (1.0-vSpentRatio);

		#ifdef ENVMAP_MODE_REFLECTION

			vec3 reflectVec = reflect( -geometry.viewDir, geometry.normal );

		#else

			vec3 reflectVec = refract( -geometry.viewDir, geometry.normal, refractionRatio );

		#endif

		reflectVec = inverseTransformDirection( reflectVec, viewMatrix );

		float specularMIPLevel = getSpecularMIPLevel( blinnShininessExponent, maxMIPLevel );

		

		vec3 queryReflectVec = vec3( flipEnvMap * reflectVec.x, reflectVec.yz );

		#ifdef TEXTURE_LOD_EXT

			vec4 envMapColor = textureCubeLodEXT( envMap, queryReflectVec, specularMIPLevel );

		#else

			vec4 envMapColor = textureCube( envMap, queryReflectVec, specularMIPLevel );

		#endif

		envMapColor.rgb = envMapTexelToLinear( envMapColor ).rgb;


		return envMapColor.rgb * clamp(envMapIntensityVar, 0.2, 1.0);

	}

#endif


#include <fog_pars_fragment>
#include <lights_pars_begin>
#include <lights_physical_pars_fragment>
#include <shadowmap_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <roughnessmap_pars_fragment>
#include <metalnessmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>

void main() {

	#include <clipping_planes_fragment>

	float d = min(min(vBarycentric.x, vBarycentric.y), vBarycentric.z);

	float edgeAmount = pow(
		clamp(
			 (1.0 - d),
			 0.9, 1.0
		), 
		10.0
	);


	float sideEdgeAmount = edgeAmount * ((1.0-(vBottomVertex * 0.7)));

	vec3 diffuseVar = vec3( 0.0 );

	diffuseVar += 1.0-(vSpentRatio * 0.7);
	
	vec4 diffuseColor = vec4( diffuseVar + sideEdgeAmount, opacity);

	#include <normal_fragment_begin>

	vec3 normalSmooth = normalize( vNormal );
	#ifdef DOUBLE_SIDED
		normalSmooth = normalSmooth * ( float( gl_FrontFacing ) * 2.0 - 1.0 );
	#endif


	#include <normal_fragment_maps>

	diffuseColor.rgb = mix( vec3(23./255., 73./255., 141./255.), diffuseColor.rgb, 0.5 );

	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );

	vec3 totalEmissiveRadiance = vec3(0.0);

	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <roughnessmap_fragment>
	#include <metalnessmap_fragment>

	// #include <emissivemap_fragment>

	// accumulation
	#include <lights_physical_fragment>
	#include <lights_fragment_begin>

	#include <lights_fragment_maps>
	#include <lights_fragment_end>

	// modulation
	#include <aomap_fragment>

	vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + reflectedLight.directSpecular + reflectedLight.indirectSpecular + totalEmissiveRadiance;

	float noiseAmount = noise(vec4(vOffset.xyz / (vScale * 8.0), uTime * 0.00025)) * 0.1;

	outgoingLight += noiseAmount * 0.5;

	vec2 st = (vec2((vUv.x * vScale * 5.0), vOffset.y) * 0.5);
	vec2 ipos = floor(st);  // integer
	vec2 fpos = fract(st);  // fraction

	vec2 tile = truchetPattern(fpos, random( ipos ) * uTime * 0.00005);

	// Maze
	float tileColor = 0.0;
	tileColor = smoothstep(tile.x-0.3, tile.x, tile.y)-
			smoothstep(tile.x, tile.x+0.3, tile.y);

	// further smoothing    
	tileColor -= smoothstep(tile.x+0.3,tile.x,0.0)-
			smoothstep(tile.x,tile.x-0.3,-0.15);
	
	tileColor -= smoothstep(tile.y+0.3,tile.y,0.0)-
			smoothstep(tile.y,tile.y-0.3,-0.15);
	
	tileColor -= smoothstep(tile.x+0.3,tile.x,1.15)-
			smoothstep(tile.x,tile.x-0.3,1.0);
	
	tileColor -= smoothstep(tile.y+0.3,tile.y,1.15)-
			smoothstep(tile.y,tile.y-0.3,1.0);

	float absNoise = abs(noiseAmount) * 30.0;
	
	float tileNoiseColor = ((pow(tileColor, 3.0) * 2.0) * absNoise) * (0.1 + (vEnvelope * 3.0));


	outgoingLight.b += (tileNoiseColor * (1.0 - vTopVertex) * (1.0 - vBottomVertex) );
	outgoingLight.g += (tileNoiseColor * (1.0 - vTopVertex) * (1.0 - vBottomVertex) ) * 0.3;

	outgoingLight += smoothstep(0.7, 1.0, edgeAmount) * 0.05;
	outgoingLight += (pow(vTopVertex, 5.0) * vEnvelope) * 0.2;
	outgoingLight += (pow(vBottomVertex, 5.0) * vEnvelope) * 0.2;

	outgoingLight += vIsHovered * (edgeAmount * 0.5);
	outgoingLight += vIsSelected * (edgeAmount * 0.5);

	if (vWorldPosition.y < 0.0) {
		diffuseColor.a *= 0.8;
	}

	gl_FragColor = vec4( outgoingLight, diffuseColor.a);

	#include <tonemapping_fragment>
	#include <encodings_fragment>

	#ifdef USE_FOG

		#ifdef FOG_EXP2

			float fogFactor = whiteCompliment( exp2( - fogDensity * fogDensity * fogDepth * fogDepth * LOG2 ) );

		#else

			float fogFactor = smoothstep( fogNear, fogFar, fogDepth );

		#endif

		gl_FragColor.a = mix( gl_FragColor.a, 0.0, fogFactor );

	#endif

	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
	

}