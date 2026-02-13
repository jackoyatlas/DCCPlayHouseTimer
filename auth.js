import { auth, db } from "./firebase.js";
import {
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    sendPasswordResetEmail,
    signOut,
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js";
import { setDoc, doc, getDoc } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js";

// --- FORM ELEMENTS ---
const loginForm = document.getElementById("login-form");
const signupForm = document.getElementById("signup-form");
const forgotForm = document.getElementById("forgot-form");

const loginEmail = document.getElementById("login-email");
const loginPassword = document.getElementById("login-password");
const signupFullName = document.getElementById("signup-fullname");
const signupEmail = document.getElementById("signup-email");
const signupPassword = document.getElementById("signup-password");
const forgotEmail = document.getElementById("forgot-email");

const loginStatus = document.getElementById("auth-status");
const signupStatus = document.getElementById("signup-status");
const forgotStatus = document.getElementById("forgot-status");

// --- AUTH FUNCTIONS ---
const showForm = form => {
    loginForm.style.display = "none";
    signupForm.style.display = "none";
    forgotForm.style.display = "none";

    form.style.display = "block";
};

const showStatus = (statusEl, msg) => {
    statusEl.textContent = msg;
};

window.login = () => {
    signInWithEmailAndPassword(auth, loginEmail.value, loginPassword.value)
        .catch(e => showStatus(loginStatus, e.message));
};

window.signup = async () => {
    try {
        console.log("Starting signup process...");
        const userCredential = await createUserWithEmailAndPassword(auth, signupEmail.value, signupPassword.value);
        const user = userCredential.user;
        console.log("User created in Auth:", user.uid);

        // Create user document in Firestore
        const userData = {
            fullName: signupFullName.value,
            email: user.email,
            status: "pending", // Set initial status to pending for admin approval
            createdAt: new Date().toISOString(),
            uid: user.uid
        };

        try {
            await setDoc(doc(db, "users", user.uid), userData);
            console.log("User document created in Firestore");
            alert("Account created successfully");
            showStatus(signupStatus, "Account created. Please wait for admin approval.");
        } catch (firestoreError) {
            console.error("Firestore write error:", firestoreError);
            alert("Account created but failed to save user data. Please contact support.");
            showStatus(signupStatus, "Account created but data save failed. Please contact support.");
        }

    } catch (authError) {
        console.error("Auth signup error:", authError);
        alert("Signup failed: " + authError.message);
        showStatus(signupStatus, authError.message);
    }
};

window.forgot = () => {
    sendPasswordResetEmail(auth, forgotEmail.value)
        .then(() => showStatus(forgotStatus, "Password reset email sent"))
        .catch(e => showStatus(forgotStatus, e.message));
};

window.logout = () => {
    if (confirm("Are you sure you want to logout?")) {
        signOut(auth);
    }
};

onAuthStateChanged(auth, async user => {
    if (user) {
        try {
            const userDoc = await getDoc(doc(db, "users", user.uid));
            if (userDoc.exists()) {
                const userData = userDoc.data();
                if (userData.status === "approved") {
                    document.getElementById("app").style.display = "block";
                    document.querySelector(".auth-wrapper").style.display = "none";
                    document.getElementById("user-display-name").textContent = "Hi! " + userData.fullName.toUpperCase();
                } else if (userData.status === "pending") {
                    showStatus(loginStatus, "Your account is pending approval. Please wait for admin approval.");
                    signOut(auth);
                } else if (userData.status === "declined") {
                    showStatus(loginStatus, "Access denied. Your account was declined.");
                    signOut(auth);
                } else {
                    showStatus(loginStatus, "Access denied. Your account is not approved.");
                    signOut(auth);
                }
            } else {
                showStatus(loginStatus, "User data not found. Please contact support.");
                signOut(auth);
            }
        } catch (error) {
            console.error("Error checking user status:", error);
            showStatus(loginStatus, "Error verifying account status. Please try again.");
            signOut(auth);
        }
    } else {
        document.getElementById("app").style.display = "none";
        document.querySelector(".auth-wrapper").style.display = "flex";
        document.getElementById("user-display-name").textContent = "Loading...";
        showForm(loginForm);
    }
});

// --- SWITCH FORMS ---
document.getElementById("to-signup").onclick = () => showForm(signupForm);
document.getElementById("to-login").onclick = () => showForm(loginForm);
document.getElementById("forgot-link").onclick = () => showForm(forgotForm);
document.getElementById("back-to-login").onclick = () => showForm(loginForm);

// --- BUTTON EVENTS ---
document.getElementById("login-btn").onclick = login;
document.getElementById("signup-btn").onclick = signup;
document.getElementById("forgot-btn").onclick = forgot;

// --- INITIALIZE ---
showForm(loginForm);