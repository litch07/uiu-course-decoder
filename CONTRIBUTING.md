# Contributing to UIU Course Code Decoder

First off, thank you for considering contributing to this project! This tool is built by students, for students, and keeping our course database up to date is a community effort.

## 📚 Adding Missing Courses

Currently, the extension is pre-loaded with **CSE, EEE, BBA, and Data Science** courses. However, there are many other department courses that we haven't been able to extract yet!

The single most helpful way to contribute is by adding these missing course codes to our database (`courses.json`). Whether you want to add your entire department's curriculum or just a few electives, every bit helps! 

### How to format `courses.json`
The `courses.json` file is a simple key-value dictionary where the **Key** is the course code and the **Value** is the full course name.

**Rules for adding a course:**
1. Keep the course code uppercase.
2. Ensure there is a single space between the department prefix and the number (e.g., `CSE 3421`, not `CSE3421`).
3. Capitalize the course name properly.

**Example:**
```json
{
  "CSE 3421": "Database Management Systems",
  "EEE 1011": "Electrical Circuits I"
}
```

## 🛠️ How to Submit Your Changes (GitHub Flow)

If you are new to Git and GitHub, follow these steps to submit your additions:

1. **Fork the Repository**: Click the "Fork" button in the top right corner of this repository to create your own copy.
2. **Clone your Fork**:
   ```bash
   git clone https://github.com/YOUR_USERNAME/uiu-course-decoder.git
   cd uiu-course-decoder
   ```
3. **Create a Branch**: Create a new branch for your changes.
   ```bash
   git checkout -b add-new-courses
   ```
4. **Make your Changes**: Open `courses.json` (or any other file) and make your additions.
5. **Commit your Changes**:
   ```bash
   git add courses.json
   git commit -m "Add new CSE and EEE courses"
   ```
6. **Push to your Fork**:
   ```bash
   git push origin add-new-courses
   ```
7. **Submit a Pull Request**: Go to the original repository on GitHub, and you'll see a green button to "Compare & pull request". Click it, describe your changes, and submit!

We will review your PR as soon as possible. Thank you for making UIU student life a bit easier!
