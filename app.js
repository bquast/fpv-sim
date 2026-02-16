import * as THREE from './lib/three.module.min.js';

let scene, camera, renderer, clock;
const keys = {};

// Physics Constants
const GRAVITY = 9.81;
const THRUST_MAX = 35.0; // Increased for city flying
const DRAG = 0.015;
const ANGULAR_RATE = 4.0; 

// Drone State
const drone = {
    position: new THREE.Vector3(0, 10, 50),
    velocity: new THREE.Vector3(0, 0, 0),
    rotation: new THREE.Euler(0, 0, 0, 'YXZ'),
    throttle: 0
};

function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x88ccff);
    scene.fog = new THREE.Fog(0x88ccff, 20, 400);
    
    camera = new THREE.PerspectiveCamera(85, window.innerWidth / window.innerHeight, 0.1, 1000);
    
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    clock = new THREE.Clock();

    // Lighting
    scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    const sun = new THREE.DirectionalLight(0xffffff, 0.8);
    sun.position.set(100, 200, 100);
    scene.add(sun);

    // --- City Generation ---
    const citySize = 1000;
    const gridDivisions = 20;
    const step = citySize / gridDivisions;

    // Ground/Roads
    const groundGeo = new THREE.PlaneGeometry(citySize, citySize);
    groundGeo.rotateX(-Math.PI / 2);
    const groundMat = new THREE.MeshPhongMaterial({ color: 0x222222 });
    scene.add(new THREE.Mesh(groundGeo, groundMat));

    // Buildings (Randomized boxes)
    const boxGeo = new THREE.BoxGeometry(1, 1, 1);
    const boxMat = new THREE.MeshPhongMaterial({ color: 0x777777 });

    for (let x = -citySize/2; x < citySize/2; x += step) {
        for (let z = -citySize/2; z < citySize/2; z += step) {
            if (Math.random() > 0.6) { // 40% chance of a building
                const h = 5 + Math.random() * 30;
                const w = 10 + Math.random() * 15;
                const building = new THREE.Mesh(boxGeo, boxMat);
                building.scale.set(w, h, w);
                building.position.set(x + step/2, h/2, z + step/2);
                scene.add(building);
            }
        }
    }

    // --- FPV Drone "Rod" (The Antenna/Pitot Tube) ---
    const rodGroup = new THREE.Group();
    const rodGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.6);
    const rodMat = new THREE.MeshPhongMaterial({ color: 0x111111 });
    const rod = new THREE.Mesh(rodGeo, rodMat);
    
    rod.rotation.x = Math.PI / 2.2; // Angle it forward
    rod.position.set(0, -0.4, -0.5); // Position below/in-front of lens
    rodGroup.add(rod);
    
    // Parent rod to camera so it tilts with the drone view
    camera.add(rodGroup);
    scene.add(camera);

    window.addEventListener('keydown', (e) => keys[e.code] = true);
    window.addEventListener('keyup', (e) => keys[e.code] = false);
    animate();
}

function updatePhysics(dt) {
    // Rotation logic (Acro mode)
    if (keys['KeyW']) drone.rotation.x -= ANGULAR_RATE * dt;
    if (keys['KeyS']) drone.rotation.x += ANGULAR_RATE * dt;
    if (keys['KeyA']) drone.rotation.z += ANGULAR_RATE * dt;
    if (keys['KeyD']) drone.rotation.z -= ANGULAR_RATE * dt;
    if (keys['ArrowLeft']) drone.rotation.y += ANGULAR_RATE * dt;
    if (keys['ArrowRight']) drone.rotation.y -= ANGULAR_RATE * dt;

    // Throttle logic
    if (keys['ArrowUp']) drone.throttle = Math.min(drone.throttle + 2.0 * dt, 1.0);
    else if (keys['ArrowDown']) drone.throttle = Math.max(drone.throttle - 2.0 * dt, 0.0);

    const up = new THREE.Vector3(0, 1, 0).applyEuler(drone.rotation);
    const thrust = up.multiplyScalar(drone.throttle * THRUST_MAX);
    const gravity = new THREE.Vector3(0, -GRAVITY, 0);
    
    drone.velocity.add(thrust.add(gravity).multiplyScalar(dt));
    drone.velocity.multiplyScalar(1 - DRAG);
    drone.position.add(drone.velocity.clone().multiplyScalar(dt));

    // Simple Floor Collision
    if (drone.position.y < 0.2) {
        drone.position.y = 0.2;
        drone.velocity.set(0,0,0);
    }

    // Reset
    if (keys['KeyR']) {
        drone.position.set(0, 10, 50);
        drone.velocity.set(0,0,0);
        drone.rotation.set(0,0,0);
    }

    camera.position.copy(drone.position);
    camera.quaternion.setFromEuler(drone.rotation);

    document.getElementById('alt').innerText = drone.position.y.toFixed(1);
    document.getElementById('spd').innerText = (drone.velocity.length() * 3.6).toFixed(0);
}

function animate() {
    requestAnimationFrame(animate);
    updatePhysics(clock.getDelta());
    renderer.render(scene, camera);
}

init();