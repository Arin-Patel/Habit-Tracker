import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import { getDatabase, ref, set, push, onValue, remove, update, get } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js';
import firebaseConfig from "./firebase-config.js";

// Initialize EmailJS for sending emails
emailjs.init('moNqooJGlXiG7Cm8i');

// Firebase configuration - REPLACE WITH YOUR CONFIG

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

let currentUser = null;
let habits = {};

// Populate timezone dropdown
function populateTimezones() {
    const timezoneSelect = document.getElementById('timezoneSelect');
    const timezones = Intl.supportedValuesOf('timeZone');
    const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    timezones.forEach(tz => {
        const option = document.createElement('option');
        option.value = tz;
        option.textContent = tz.replace(/_/g, ' ');
        if (tz === userTimezone) {
            option.selected = true;
        }
        timezoneSelect.appendChild(option);
    });

    updateTimezoneInfo();
}

function updateTimezoneInfo() {
    const timezone = document.getElementById('timezoneSelect').value;
    const time = document.getElementById('reminderTime').value;
    const now = new Date();
    const offset = new Date().toLocaleString('en-US', { timeZone: timezone, timeZoneName: 'short' });
    document.getElementById('timezoneInfo').textContent = `Reminder will be sent at ${time} in ${timezone}`;
}

// Auth Functions
window.toggleAuth = function () {
    const login = document.getElementById('loginForm');
    const signup = document.getElementById('signupForm');
    if (login.style.display === 'none') {
        login.style.display = 'block';
        signup.style.display = 'none';
    } else {
        login.style.display = 'none';
        signup.style.display = 'block';
    }
};

window.login = async function () {
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    const errorEl = document.getElementById('loginError');

    try {
        await signInWithEmailAndPassword(auth, email, password);
        errorEl.style.display = 'none';
    } catch (error) {
        errorEl.textContent = error.message;
        errorEl.style.display = 'block';
    }
};

window.signup = async function () {
    const email = document.getElementById('signupEmail').value;
    const password = document.getElementById('signupPassword').value;
    const errorEl = document.getElementById('signupError');

    try {
        await createUserWithEmailAndPassword(auth, email, password);
        errorEl.style.display = 'none';
    } catch (error) {
        errorEl.textContent = error.message;
        errorEl.style.display = 'block';
    }
};

window.logout = async function () {
    await signOut(auth);
};

// Auth State Observer
onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUser = user;
        document.getElementById('authSection').style.display = 'none';
        document.getElementById('mainContent').style.display = 'block';
        document.getElementById('userEmail').textContent = user.email;
        document.getElementById('notificationEmail').value = user.email;
        populateTimezones();
        loadHabits();
        loadNotificationSettings();
        scheduleEmailReminders();
    } else {
        currentUser = null;
        document.getElementById('authSection').style.display = 'block';
        document.getElementById('mainContent').style.display = 'none';
    }
});

// Habit Functions
window.addHabit = async function () {
    const name = document.getElementById('habitName').value;
    const description = document.getElementById('habitDescription').value;
    const successEl = document.getElementById('addHabitSuccess');

    if (!name) {
        alert('Please enter a habit name');
        return;
    }

    const habitData = {
        name: name,
        description: description,
        createdAt: Date.now(),
        completions: {},
        streak: 0
    };

    try {
        const habitsRef = ref(db, `users/${currentUser.uid}/habits`);
        await push(habitsRef, habitData);

        document.getElementById('habitName').value = '';
        document.getElementById('habitDescription').value = '';

        successEl.textContent = 'Habit added successfully! ✓';
        successEl.style.display = 'block';
        setTimeout(() => successEl.style.display = 'none', 3000);
    } catch (error) {
        alert('Error adding habit: ' + error.message);
    }
};

function loadHabits() {
    const habitsRef = ref(db, `users/${currentUser.uid}/habits`);
    onValue(habitsRef, (snapshot) => {
        habits = snapshot.val() || {};
        renderHabits();
        updateStatistics();
    });
}

function renderHabits() {
    const habitsList = document.getElementById('habitsList');
    habitsList.innerHTML = '';

    if (Object.keys(habits).length === 0) {
        habitsList.innerHTML = '<p style="color: #999; text-align: center; padding: 20px;">No habits yet. Add your first habit to get started! 🚀</p>';
        return;
    }

    Object.entries(habits).forEach(([id, habit]) => {
        const today = new Date().toDateString();
        const isCompletedToday = habit.completions && habit.completions[today];

        const habitEl = document.createElement('div');
        habitEl.className = 'habit-item';
        habitEl.innerHTML = `
                    <div class="habit-header">
                        <div>
                            <div class="habit-name">${habit.name}</div>
                            <div class="habit-description">${habit.description || ''}</div>
                        </div>
                        <div class="habit-actions">
                            <button class="check-btn ${isCompletedToday ? 'completed' : ''}" 
                                    onclick="toggleCompletion('${id}')">
                                ${isCompletedToday ? '✓ Done' : 'Mark Done'}
                            </button>
                            <button class="delete-btn" onclick="deleteHabit('${id}')">Delete</button>
                        </div>
                    </div>
                    <div class="habit-streak">
                        ${renderLast7Days(habit)}
                    </div>
                `;
        habitsList.appendChild(habitEl);
    });
}

function renderLast7Days(habit) {
    let html = '';
    for (let i = 6; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dateStr = date.toDateString();
        const isCompleted = habit.completions && habit.completions[dateStr];
        const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
        html += `<div class="day-box ${isCompleted ? 'completed' : ''}">${dayName}</div>`;
    }
    return html;
}

window.toggleCompletion = async function (habitId) {
    const today = new Date().toDateString();
    const habit = habits[habitId];
    const completions = habit.completions || {};
    const isCompleted = completions[today];

    const updates = {};
    if (isCompleted) {
        updates[`users/${currentUser.uid}/habits/${habitId}/completions/${today}`] = null;
    } else {
        updates[`users/${currentUser.uid}/habits/${habitId}/completions/${today}`] = true;
    }

    await update(ref(db), updates);
};

window.deleteHabit = async function (habitId) {
    if (confirm('Are you sure you want to delete this habit?')) {
        await remove(ref(db, `users/${currentUser.uid}/habits/${habitId}`));
    }
};

function updateStatistics() {
    // 1. Setup normalized "Today" for accurate day-diff math
    const today = new Date();
    const todayStr = today.toDateString();
    
    // Create a version of today at midnight to compare against
    const startOfToday = new Date(today);
    startOfToday.setHours(0, 0, 0, 0);

    let totalHabits = Object.keys(habits).length;
    let completedTodayCount = 0;
    let totalCompletions = 0;
    let possibleCompletions = 0;

    // 2. Initialize last 7 days array (Index 6 = Today, Index 0 = 6 days ago)
    const last7Days = Array(7).fill(0);

    Object.values(habits).forEach(habit => {
        if (habit.completions) {
            Object.keys(habit.completions).forEach(dateStr => {
                const completionDate = new Date(dateStr);
                completionDate.setHours(0, 0, 0, 0);

                // Calculate difference in days
                const diffTime = startOfToday - completionDate;
                const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

                // If the completion is within the last 7 days (0 to 6)
                if (diffDays >= 0 && diffDays < 7) {
                    last7Days[6 - diffDays]++; 
                }

                // Check specifically for today's completion
                if (dateStr === todayStr) {
                    completedTodayCount++;
                }

                totalCompletions++;
            });
        }

        // 3. Calculate Possible Completions (for completion rate %)
        // Uses the date the habit was created
        const createdAt = new Date(habit.createdAt);
        createdAt.setHours(0, 0, 0, 0);
        const daysSinceCreation = Math.max(1, Math.ceil((startOfToday - createdAt) / (1000 * 60 * 60 * 24)) + 1);
        
        possibleCompletions += daysSinceCreation;
    });

    // 4. Calculate Final Stats
    const completionRate = possibleCompletions > 0
        ? Math.round((totalCompletions / possibleCompletions) * 100)
        : 0;

    const currentStreak = calculateCurrentStreak();

    // 5. Update the UI
    document.getElementById('totalHabits').textContent = totalHabits;
    document.getElementById('completedToday').textContent = completedTodayCount;
    document.getElementById('currentStreak').textContent = currentStreak;
    document.getElementById('completionRate').textContent = completionRate + '%';

    // 6. Pass normalized data to your chart
    renderChart(last7Days);
}


function calculateCurrentStreak() {
    let streak = 0;
    let date = new Date();

    while (true) {
        const dateStr = date.toDateString();
        let completedAll = true;

        for (let habit of Object.values(habits)) {
            if (!habit.completions || !habit.completions[dateStr]) {
                completedAll = false;
                break;
            }
        }

        if (!completedAll) break;
        streak++;
        date.setDate(date.getDate() - 1);

        if (streak > 365) break;
    }

    return streak;
}

function renderChart(data = []) {
    const chartBars = document.getElementById("chartBars");
    if (!Array.isArray(data)) {
        console.warn("Chart data invalid, resetting:", data);
        data = [];
    }


    if (!chartBars) {
        console.error("chartBars div not found");
        return;
    }

    chartBars.innerHTML = "";

    const max = Math.max(...data, 1);

    data.forEach((value, i) => {
        const wrap = document.createElement("div");

        const bar = document.createElement("div");
        bar.className = "chart-bar";
        bar.style.height = `${(value / max) * 100}%`;

        const label = document.createElement("div");
        label.className = "chart-label";
        label.innerText = `Day ${i + 1}`;

        wrap.appendChild(bar);
        wrap.appendChild(label);
        chartBars.appendChild(wrap);
    });
}


// Notification Settings
window.saveNotificationSettings = async function () {
    const email = document.getElementById('notificationEmail').value;
    const time = document.getElementById('reminderTime').value;
    const timezone = document.getElementById('timezoneSelect').value;
    const successEl = document.getElementById('notifSuccess');
    const errorEl = document.getElementById('notifError');
    const statusEl = document.getElementById('notificationStatus');
    const statusIndicator = document.getElementById('statusIndicator');
    const statusText = document.getElementById('statusText');
    const saveBtn = document.getElementById('saveNotifBtn');

    if (!email || !time) {
        errorEl.textContent = 'Please fill in all fields';
        errorEl.style.display = 'block';
        setTimeout(() => errorEl.style.display = 'none', 3000);
        return;
    }

    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';

    try {
        const notificationSettings = {
            email: email,
            time: time,
            timezone: timezone,
            enabled: true,
            updatedAt: Date.now(),
            lastSent: null
        };

        await set(ref(db, `users/${currentUser.uid}/notificationSettings`), notificationSettings);

        successEl.textContent = `✓ Email notifications enabled! You'll receive daily reminders at ${time} (${timezone})`;
        successEl.style.display = 'block';
        errorEl.style.display = 'none';

        statusEl.style.display = 'flex';
        statusIndicator.classList.remove('disabled');
        statusText.textContent = `Active - Daily emails at ${time}`;

        // Start the reminder scheduler
        scheduleEmailReminders();

        setTimeout(() => successEl.style.display = 'none', 8000);
    } catch (error) {
        errorEl.textContent = 'Error saving settings: ' + error.message;
        errorEl.style.display = 'block';
        successEl.style.display = 'none';
    } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = '💾 Save Email Notification Settings';
    }
};

window.sendDailyReminderEmail = async function () {
    if (!currentUser) {
        console.warn("No user logged in. Skipping email.");
        return;
    }

    const settingsRef = ref(db, `users/${currentUser.uid}/notificationSettings`);
    const settingsSnapshot = await get(settingsRef);
    const settings = settingsSnapshot.val();

    if (!settings) {
        console.warn("No notification settings found for user. Skipping email.");
        return;
    }

    if (!settings.enabled) {
        console.log("Email notifications are disabled. Skipping email.");
        return;
    }

    if (!settings.email) {
        console.error("Recipient email is empty. Please set your notification email in settings.");
        return;
    }

    const today = new Date().toDateString();
    const incompleteHabits = [];

    Object.entries(habits).forEach(([id, habit]) => {
        const isCompleted = habit.completions && habit.completions[today];
        if (!isCompleted) {
            incompleteHabits.push({
                name: habit.name,
                description: habit.description || ''
            });
        }
    });

    if (incompleteHabits.length === 0) {
        console.log("All habits completed - no reminder needed.");
        return;
    }

    const habitListHTML = incompleteHabits.map(habit =>
        `<div style="padding: 12px; margin: 8px 0; background: #e3f2fd; border-left: 4px solid #2196F3; border-radius: 4px;">
            <strong>☐ ${habit.name}</strong>
            ${habit.description ? `<br><span style="color: #666; font-size: 14px;">${habit.description}</span>` : ''}
        </div>`
    ).join('');

    const templateParams = {
        to_email: settings.email,        // must match exactly your EmailJS template variable
        to_name: currentUser.email.split('@')[0],
        habit_count: incompleteHabits.length,
        habit_plural: incompleteHabits.length > 1 ? 's' : '',
        habit_list: habitListHTML,
        app_url: window.location.origin
    };

    console.log("Attempting to send email with params:", templateParams);

    try {
        const response = await emailjs.send(
            'service_6hmfc4p',      // use your working service ID
            'template_q9nklfh',     // use your working template ID
            templateParams
        );
        console.log("EMAIL SENT SUCCESSFULLY", response);

        // Update last sent timestamp
        await update(settingsRef, { lastSent: Date.now() });
    } catch (error) {
        console.error("EMAIL FAILED:", error);
    }
}

function scheduleEmailReminders() {
    // Check every minute if it's time to send reminder
    setInterval(async () => {
        if (!currentUser) return;

        try {
            const settingsRef = ref(db, `users/${currentUser.uid}/notificationSettings`);
            const settingsSnapshot = await get(settingsRef); // FIX: use get() instead of settingsRef.get()
            const settings = settingsSnapshot.val();

            if (!settings || !settings.enabled) return;

            const now = new Date();
            const userTimezone = settings.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;

            // Get current time in user's timezone
            const userTime = new Date(now.toLocaleString('en-US', { timeZone: userTimezone }));
            const currentHours = userTime.getHours();
            const currentMinutes = userTime.getMinutes();

            const [reminderHours, reminderMinutes] = settings.time.split(':').map(Number);

            console.log("Scheduler running:", userTime.toLocaleTimeString(), "Reminder time:", settings.time);

            // Check if it's the right time (within the same minute)
            if (currentHours === reminderHours && currentMinutes === reminderMinutes) {
                const lastSent = settings.lastSent || 0;
                const today = new Date().toDateString();

                if (new Date(lastSent).toDateString() !== today) {
                    console.log("Triggering email now...");
                    await sendDailyReminderEmail();
                } else {
                    console.log("Email already sent today");
                }
            }

        } catch (error) {
            console.error("Error in scheduler:", error);
        }

    }, 60000); // Check every minute
}


function loadNotificationSettings() {
    const settingsRef = ref(db, `users/${currentUser.uid}/notificationSettings`);
    onValue(settingsRef, (snapshot) => {
        const settings = snapshot.val();
        if (settings) {
            document.getElementById('notificationEmail').value = settings.email;
            document.getElementById('reminderTime').value = settings.time;
            document.getElementById('timezoneSelect').value = settings.timezone;

            const statusEl = document.getElementById('notificationStatus');
            const statusIndicator = document.getElementById('statusIndicator');
            const statusText = document.getElementById('statusText');

            statusEl.style.display = 'flex';
            if (settings.enabled) {
                statusIndicator.classList.remove('disabled');
                statusText.textContent = `Active - Daily emails at ${settings.time}`;
            } else {
                statusIndicator.classList.add('disabled');
                statusText.textContent = 'Notifications disabled';
            }
        }
    });
}

// Update timezone info when time or timezone changes
document.addEventListener('DOMContentLoaded', () => {
    const timeInput = document.getElementById('reminderTime');
    const timezoneSelect = document.getElementById('timezoneSelect');

    if (timeInput) timeInput.addEventListener('change', updateTimezoneInfo);
    if (timezoneSelect) timezoneSelect.addEventListener('change', updateTimezoneInfo);
});
