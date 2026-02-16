/**
 * FPV Drone Simulator - Vanilla Three.js
 * Implementation: Kinematic Flight Model (Acro Mode)
 */

import * as THREE from './lib/three.module.min.js';

let scene, camera, renderer, clock;
let terrain;
const keys = {};

// Physics Constants
const GRAVITY = 9.81;
const THRUST_MAX = 25.0;
const DRAG = 0.02;
const ANGULAR_RATE = 3.5; // Sensitivity for Roll/Pitch/Yaw

// Drone State
const drone = {
    position: new THREE.Vector3(0, 5, 0),
    velocity: new THREE.Vector3(0, 0, 0),
    rotation: new THREE.Euler(0, 0, 0, 'YXZ'), // Standard flight order
    throttle: 0
};

function init() {
    scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x88ccff, 10, 500);
    
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor(0x88ccff);
    document.body.appendChild(renderer.domElement);

    clock = new THREE.Clock();

    // Environment
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight(0xffffff, 1);
    sunLight.position.set(50, 100, 50);
    scene.add(sunLight);

    // Simple Grid Terrain
    const gridGeom = new THREE.PlaneGeometry(1000, 1000, 100, 100);
    gridGeom.rotateX(-Math.PI / 2);
    const gridMat = new THREE.MeshPhongMaterial({ color: 0x33aa33, wireframe: true });
    terrain = new THREE.Mesh(gridGeom, gridMat);
    scene.add(terrain);

    // Input listeners
    window.addEventListener('keydown', (e) => keys[e.code] = true);
    window.addEventListener('keyup', (e) => keys[e.code] = false);
    window.addEventListener('resize', onWindowResize);

    animate();
}

function updatePhysics(dt) {
    // 1. Handle Rotations (Acro Style: Rates, not self-leveling)
    if (keys['KeyW']) drone.rotation.x -= ANGULAR_RATE * dt;
    if (keys['KeyS']) drone.rotation.x += ANGULAR_RATE * dt;
    if (keys['KeyA']) drone.rotation.z += ANGULAR_RATE * dt;
    if (keys['KeyD']) drone.rotation.z -= ANGULAR_RATE * dt;
    if (keys['ArrowLeft']) drone.rotation.y += ANGULAR_RATE * dt;
    if (keys['ArrowRight']) drone.rotation.y -= ANGULAR_RATE * dt;

    // 2. Handle Throttle
    if (keys['ArrowUp']) drone.throttle = Math.min(drone.throttle + 1.5 * dt, 1.0);
    else if (keys['ArrowDown']) drone.throttle = Math.max(drone.throttle - 1.5 * dt, 0.0);

    // 3. Calculate Forces
    const upVector = new THREE.Vector3(0, 1, 0);
    upVector.applyEuler(drone.rotation); // Get the drone's "Up" relative to its tilt

    const thrustForce = upVector.multiplyScalar(drone.throttle * THRUST_MAX);
    const gravityForce = new THREE.Vector3(0, -GRAVITY, 0);
    
    // Total Acceleration
    const netAcceleration = thrustForce.add(gravityForce);
    
    // 4. Update Velocity & Position (Euler Integration)
    drone.velocity.add(netAcceleration.multiplyScalar(dt));
    drone.velocity.multiplyScalar(1 - DRAG); // Air resistance
    
    drone.position.add(drone.velocity.clone().multiplyScalar(dt));

    // Ground Collision
    if (drone.position.y < 0.5) {
        drone.position.y = 0.5;
        drone.velocity.set(0, 0, 0);
    }

    // Reset
    if (keys['KeyR']) {
        drone.position.set(0, 5, 0);
        drone.velocity.set(0, 0, 0);
        drone.rotation.set(0, 0, 0);
        drone.throttle = 0;
    }

    // Sync Camera
    camera.position.copy(drone.position);
    camera.quaternion.setFromEuler(drone.rotation);

    // UI Updates
    document.getElementById('alt').innerText = drone.position.y.toFixed(1);
    document.getElementById('spd').innerText = (drone.velocity.length() * 3.6).toFixed(0);
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
    requestAnimationFrame(animate);
    const dt = clock.getDelta();
    updatePhysics(dt);
    renderer.render(scene, camera);
}

init();