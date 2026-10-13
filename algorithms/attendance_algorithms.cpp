// Three C++17 algorithms for the IIH College attendance project.
// Compile: g++ -std=c++17 attendance_algorithms.cpp -o attendance_algorithms
#include <algorithm>
#include <iostream>
#include <string>
#include <vector>
using namespace std;

struct Student {
    int id;
    string name;
    int absences;
    int classes;
};

// Algorithm 1: Linear search by student ID. Time: O(n).
int findStudentById(const vector<Student>& students, int id) {
    for (size_t i = 0; i < students.size(); ++i)
        if (students[i].id == id) return static_cast<int>(i);
    return -1;
}

// Algorithm 2: Merge sort by student name. Time: O(n log n).
void mergeSort(vector<Student>& a, int left, int right) {
    if (left >= right) return;
    int mid = left + (right - left) / 2;
    mergeSort(a, left, mid);
    mergeSort(a, mid + 1, right);
    vector<Student> temp;
    int i = left, j = mid + 1;
    while (i <= mid && j <= right) {
        if (a[i].name <= a[j].name) temp.push_back(a[i++]);
        else temp.push_back(a[j++]);
    }
    while (i <= mid) temp.push_back(a[i++]);
    while (j <= right) temp.push_back(a[j++]);
    for (int k = 0; k < static_cast<int>(temp.size()); ++k) a[left + k] = temp[k];
}

// Algorithm 3: Rule-based attendance risk classifier.
string attendanceRisk(const Student& s) {
    if (s.classes <= 0) return "Insufficient data";
    double rate = 100.0 * s.absences / s.classes;
    if (rate >= 20.0) return "High risk";
    if (rate >= 10.0) return "Needs attention";
    return "Good standing";
}

int main() {
    vector<Student> students = {
        {1003, "Maria Santos", 1, 30},
        {1001, "Juan Dela Cruz", 7, 30},
        {1002, "Alex Reyes", 4, 30}
    };

    int target = 1002;
    int index = findStudentById(students, target);
    cout << "Algorithm 1 - Search: ";
    if (index >= 0) cout << students[index].name << "\\n";
    else cout << "Student not found\\n";

    mergeSort(students, 0, static_cast<int>(students.size()) - 1);
    cout << "\\nAlgorithm 2 - Sorted students:\\n";
    for (const auto& s : students)
        cout << s.name << " (ID " << s.id << ")\\n";

    cout << "\\nAlgorithm 3 - Attendance risk:\\n";
    for (const auto& s : students)
        cout << s.name << ": " << attendanceRisk(s) << "\\n";
    return 0;
}
