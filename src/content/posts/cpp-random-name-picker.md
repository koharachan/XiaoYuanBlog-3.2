---
title: C++实践：班级随机点名软件
published: 2025-11-21
updated: 2025-12-20
draft: false
description: 
image: /upload/image-LIRH-MWbk-yfre-cxiB.jpg
tags: ["c++","日常"]
category: 外版
comment: true
---

好久没更新了，今天有点能写的就来写一下吧~

起因：曹老师让我们在班上的电脑上搞一个随机点名，我们几个都对这个比较兴奋（~~有正经的理由能中午在班里玩电脑了~~），胡、李、余觉得应该用班级优化大师，于是我们下了班级优化大师，然后发现居然要登录，而我们手机都交了（啊啊啊气死我了）

于是我提议用C++写一个……于是就有了下文

程序运行截图：

![](/upload/image-LIRH-MWbk-yfre-cxiB.jpg) ![](/upload/image-bjpS.jpg)

![](/upload/image-wKdT.jpg)

让我们来实现这个代码吧：

```cpp
#include <iostream>
#include <fstream>
#include <vector>
#include <string>
#include <ctime>
#include <cstdlib>
#include <windows.h>
#include <lmaccess.h>
#include <tlhelp32.h>
#include <iomanip>
#include <algorithm>
#include <random>
#include <shlobj.h>

using namespace std;

const HANDLE hConsole = GetStdHandle(STD_OUTPUT_HANDLE);
string g_selectedName;

// 工具函数：去除字符串前后空格
string trim(const string& str) {
    size_t start = str.find_first_not_of(" \t\n\r");
    size_t end = str.find_last_not_of(" \t\n\r");
    return (start == string::npos || end == string::npos) ? "" : str.substr(start, end - start + 1);
}

// 工具函数：字符串转小写
string toLower(const string& str) {
    string res = str;
    transform(res.begin(), res.end(), res.begin(), ::tolower);
    return res;
}

// UTF8转GBK（带错误处理）
string UTF8ToGBK(const string& utf8Str) {
    if (utf8Str.empty()) return "";

    int wLen = MultiByteToWideChar(CP_UTF8, 0, utf8Str.c_str(), -1, nullptr, 0);
    if (wLen <= 0) {
        cerr << "编码转换错误：UTF8转宽字符失败！" << endl;
        return "";
    }
    wchar_t* wstr = new (nothrow) wchar_t[wLen];
    if (!wstr) {
        cerr << "内存分配失败：无法分配宽字符缓冲区！" << endl;
        return "";
    }
    if (MultiByteToWideChar(CP_UTF8, 0, utf8Str.c_str(), -1, wstr, wLen) <= 0) {
        cerr << "编码转换错误：UTF8转宽字符执行失败！" << endl;
        delete[] wstr;
        return "";
    }

    int gbkLen = WideCharToMultiByte(CP_ACP, 0, wstr, -1, nullptr, 0, nullptr, nullptr);
    if (gbkLen <= 0) {
        cerr << "编码转换错误：宽字符转GBK失败！" << endl;
        delete[] wstr;
        return "";
    }
    char* gbkStr = new (nothrow) char[gbkLen];
    if (!gbkStr) {
        cerr << "内存分配失败：无法分配GBK字符缓冲区！" << endl;
        delete[] wstr;
        return "";
    }
    if (WideCharToMultiByte(CP_ACP, 0, wstr, -1, gbkStr, gbkLen, nullptr, nullptr) <= 0) {
        cerr << "编码转换错误：宽字符转GBK执行失败！" << endl;
        delete[] wstr;
        delete[] gbkStr;
        return "";
    }

    string result(gbkStr);
    delete[] wstr;
    delete[] gbkStr;
    return result;
}

// 检查目录是否存在，不存在则提示创建
bool checkDirectory(const string& dirPath) {
    DWORD attr = GetFileAttributesA(dirPath.c_str());
    if (attr == INVALID_FILE_ATTRIBUTES) {
        cout << "??  目录不存在：" << dirPath << endl;
        cout << "是否创建该目录？(y/n)：";
        char choice;
        cin >> choice;
        cin.ignore(numeric_limits<streamsize>::max(), '\n');
        if (choice == 'y' || choice == 'Y') {
            if (CreateDirectoryA(dirPath.c_str(), nullptr)) {
                cout << "? 目录创建成功！" << endl;
                return true;
            } else {
                cerr << "? 目录创建失败！错误码：" << GetLastError() << endl;
                return false;
            }
        }
        return false;
    }
    return (attr & FILE_ATTRIBUTE_DIRECTORY) != 0;
}

// 获取用户文档目录（备选名单路径）
string getUserDocumentsPath() {
    char path[MAX_PATH];
    if (SHGetFolderPathA(nullptr, CSIDL_PERSONAL, nullptr, 0, path) == S_OK) {
        return string(path) + "\\2502sjdm";
    }
    return "";
}

// 读取名单文件（支持备选路径）
bool readUTF8NameList(string& filePath, vector<string>& names) {
    string dirPath = filePath.substr(0, filePath.find_last_of("\\"));
    if (!checkDirectory(dirPath)) {
        string backupDir = getUserDocumentsPath();
        if (!backupDir.empty() && checkDirectory(backupDir)) {
            filePath = backupDir + "\\sjdm.txt";
            cout << "??  切换到备选名单路径：" << filePath << endl;
        } else {
            cerr << "? 所有备选路径均不可用！无法读取名单文件。" << endl;
            return false;
        }
    }

    ifstream file(filePath, ios::binary);
    if (!file.is_open()) {
        cerr << "? 无法打开名单文件！" << endl;
        cerr << "路径：" << filePath << endl;
        cerr << "请检查文件是否存在，或是否有读取权限。" << endl;
        return false;
    }

    unsigned char bom[3] = {0};
    if (file.read((char*)bom, 3) && !(bom[0] == 0xEF && bom[1] == 0xBB && bom[2] == 0xBF)) {
        file.seekg(0, ios::beg);
    }

    string utf8Content((istreambuf_iterator<char>(file)), istreambuf_iterator<char>());
    file.close();

    size_t start = 0;
    size_t end = 0;
    while ((end = utf8Content.find('\n', start)) != string::npos) {
        string line = trim(utf8Content.substr(start, end - start));
        if (!line.empty()) {
            names.push_back(UTF8ToGBK(line));
        }
        start = end + 1;
    }
    string lastLine = trim(utf8Content.substr(start));
    if (!lastLine.empty()) {
        names.push_back(UTF8ToGBK(lastLine));
    }

    return true;
}

// 检查进程是否存在
bool isProcessRunning(const string& processName) {
    PROCESSENTRY32 processInfo;
    processInfo.dwSize = sizeof(processInfo);

    HANDLE processesSnapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, NULL);
    if (processesSnapshot == INVALID_HANDLE_VALUE) {
        return false;
    }

    Process32First(processesSnapshot, &processInfo);
    if (!processName.compare(processInfo.szExeFile)) {
        CloseHandle(processesSnapshot);
        return true;
    }

    while (Process32Next(processesSnapshot, &processInfo)) {
        if (!processName.compare(processInfo.szExeFile)) {
            CloseHandle(processesSnapshot);
            return true;
        }
    }

    CloseHandle(processesSnapshot);
    return false;
}

// 清除控制台当前行
void clearCurrentLine() {
    cout << "\r" << string(80, ' ') << "\r";
    cout.flush();
}

// 打印调试信息
void printDebugInfo(const string& info) {
    SetConsoleTextAttribute(hConsole, FOREGROUND_RED | FOREGROUND_GREEN | FOREGROUND_BLUE);
    cout << "[DEBUG] " << info << endl;
}

// 检查管理员权限
bool isRunAsAdmin() {
    SID_IDENTIFIER_AUTHORITY ntAuthority = SECURITY_NT_AUTHORITY;
    PSID adminSid;

    if (!AllocateAndInitializeSid(&ntAuthority, 2,
        SECURITY_BUILTIN_DOMAIN_RID,
        DOMAIN_ALIAS_RID_ADMINS,
        0, 0, 0, 0, 0, 0,
        &adminSid))
    {
        return false;
    }

    BOOL isAdmin;
    if (!CheckTokenMembership(NULL, adminSid, &isAdmin)) {
        FreeSid(adminSid);
        return false;
    }

    FreeSid(adminSid);
    return isAdmin != 0;
}

// 彩蛋功能：检查班级优化大师是否运行
void checkClassOptimizationMaster() {
    if (isProcessRunning("classmaster.exe")) {
        cout << "\n";
        SetConsoleTextAttribute(hConsole, FOREGROUND_RED | FOREGROUND_GREEN | FOREGROUND_INTENSITY);
        cout << "┌─────────────────────────────────────────────────┐\n";
        cout << "│                                                 │\n";
        cout << "│   ⚠️  警告：检测到班级优化大师正在运行！   │\n";
        cout << "│                                                 │\n";
        cout << "│   建议关闭该程序后再使用本软件，以避免冲突。  │\n";
        cout << "│                                                 │\n";
        cout << "└─────────────────────────────────────────────────┘\n";
        SetConsoleTextAttribute(hConsole, FOREGROUND_RED | FOREGROUND_GREEN | FOREGROUND_BLUE);
        cout << "\n";
    }
}

// 主函数
int main() {
    SetConsoleTitleA("韶关市中等职业技术学校信建2502班专用随机点名软件 v0.0.1");

    vector<string> names;
    string filePath = "D:\\2502sjdm\\sjdm.txt";

    if (!readUTF8NameList(filePath, names)) {
        cout << "\n程序无法继续运行，请检查上述错误后重试。\n";
        system("pause");
        return 1;
    }

    if (names.empty()) {
        cerr << "? 名单文件为空！\n";
        system("pause");
        return 1;
    }

    srand(time(NULL));

    string userName;
    string classInfo;
    string studentCount = to_string(names.size());

    while (true) {
        system("cls");
        SetConsoleTextAttribute(hConsole, FOREGROUND_GREEN | FOREGROUND_INTENSITY);
        cout << "┌─────────────────────────────────────────────────┐\n";
        cout << "│                                                 │\n";
        cout << "│   韶关市中等职业技术学校信建2502班专用随机点名   │\n";
        cout << "│   软件 v0.0.1                                  │\n";
        cout << "│                                                 │\n";
        cout << "└─────────────────────────────────────────────────┘\n";
        cout << "\n";

        SetConsoleTextAttribute(hConsole, FOREGROUND_RED | FOREGROUND_GREEN | FOREGROUND_BLUE);
        cout << "当前名单文件：" << filePath << "\n";
        cout << "名单人数：" << studentCount << "人\n";
        cout << "是否以管理员权限运行：" << (isRunAsAdmin() ? "是" : "否") << "\n";
        cout << "\n";

        checkClassOptimizationMaster();

        SetConsoleTextAttribute(hConsole, FOREGROUND_BLUE | FOREGROUND_INTENSITY);
        cout << "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n";
        cout << "\n";

        SetConsoleTextAttribute(hConsole, FOREGROUND_RED | FOREGROUND_GREEN | FOREGROUND_BLUE);
        cout << "请输入您的姓名：";
        getline(cin, userName);

        cout << "请输入班级信息（如：信建2502班）：";
        getline(cin, classInfo);

        if (userName.empty() && classInfo.empty()) {
            cout << "您未输入任何信息，程序将退出...\n";
            system("pause");
            return 0;
        }

        system("cls");
        SetConsoleTextAttribute(hConsole, FOREGROUND_GREEN | FOREGROUND_INTENSITY);
        cout << "┌─────────────────────────────────────────────────┐\n";
        cout << "│                                                 │\n";
        cout << "│   韶关市中等职业技术学校信建2502班专用随机点名   │\n";
        cout << "│   软件 v0.0.1                                  │\n";
        cout << "│                                                 │\n";
        cout << "└─────────────────────────────────────────────────┘\n";
        cout << "\n";

        SetConsoleTextAttribute(hConsole, FOREGROUND_RED | FOREGROUND_GREEN | FOREGROUND_BLUE);
        cout << "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n";
        cout << "\n";
        cout << "当前操作者：" << (userName.empty() ? "未知用户" : userName) << "\n";
        cout << "班级信息：" << (classInfo.empty() ? "信建2502班" : classInfo) << "\n";
        cout << "名单人数：" << studentCount << "人\n";
        cout << "名单文件：" << filePath << "\n";
        cout << "\n";

        SetConsoleTextAttribute(hConsole, FOREGROUND_BLUE | FOREGROUND_INTENSITY);
        cout << "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n";
        cout << "\n";

        SetConsoleTextAttribute(hConsole, FOREGROUND_RED | FOREGROUND_GREEN | FOREGROUND_BLUE);
        cout << "请输入以下命令开始操作：\n";
        cout << "  s          - 开始随机点名\n";
        cout << "  d          - 显示完整名单\n";
        cout << "  q          - 退出程序\n";
        cout << "  admin      - 检查管理员权限\n";
        cout << "  debug      - 显示调试信息\n";
        cout << "  egg        - 复活节彩蛋\n";
        cout << "\n";

        string command;
        cout << "请输入命令：";
        getline(cin, command);

        command = toLower(command);

        if (command == "q") {
            break;
        }
        else if (command == "s") {
            system("cls");
            SetConsoleTextAttribute(hConsole, FOREGROUND_RED | FOREGROUND_GREEN | FOREGROUND_INTENSITY);
            cout << "┌─────────────────────────────────────────────────┐\n";
            cout << "│                                                 │\n";
            cout << "│   正在随机点名中... 按任意键停止                    │\n";
            cout << "│                                                 │\n";
            cout << "└─────────────────────────────────────────────────┘\n";
            cout << "\n";

            SetConsoleTextAttribute(hConsole, FOREGROUND_GREEN | FOREGROUND_INTENSITY);
            cout << "┌─────────────────────────────────────────────────┐\n";
            cout << "│                                                 │\n";
            cout << "│                                                 │\n";

            int selectedIndex = -1;
            while (true) {
                selectedIndex = rand() % names.size();
                SetConsoleTextAttribute(hConsole, FOREGROUND_RED | FOREGROUND_GREEN | FOREGROUND_BLUE | FOREGROUND_INTENSITY);
                cout << "│  " << setw(40) << names[selectedIndex] << " │\n";
                Sleep(50);
                cout << "\r│                                                │\n";
            }
        }
        else if (command == "d") {
            system("cls");
            SetConsoleTextAttribute(hConsole, FOROUND_RED | FOREGROUND_GREEN | FOREGROUND_BLUE | FOREGROUND_INTENSITY);
            cout << "┌─────────────────────────────────────────────────┐\n";
            cout << "│                                                 │\n";
            cout << "│   完整名单列表                                  │\n";
            cout << "│                                                 │\n";
            cout << "└─────────────────────────────────────────────────┘\n";
            cout << "\n";

            SetConsoleTextAttribute(hConsole, FOREGROUND_RED | FOREGROUND_GREEN | FOREGROUND_BLUE);
            for (size_t i = 0; i < names.size(); i++) {
                cout << setw(3) << (i + 1) << ". " << names[i] << "\n";
            }
            cout << "\n";
            system("pause");
        }
        else if (command == "admin") {
            SetConsoleTextAttribute(hConsole, isRunAsAdmin() ? FOREGROUND_GREEN : FOREGROUND_RED);
            cout << "\n当前程序" << (isRunAsAdmin() ? "已" : "未") << "以管理员权限运行。\n";
            system("pause");
        }
        else if (command == "debug") {
            SetConsoleTextAttribute(hConsole, FOREGROUND_GREEN | FOREGROUND_INTENSITY);
            cout << "\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n";
            SetConsoleTextAttribute(hConsole, FOROUND_RED | FOREGROUND_GREEN | FOREGROUND_BLUE);
            printDebugInfo("程序路径：" + filePath);
            printDebugInfo("名单人数：" + to_string(names.size()));
            printDebugInfo("管理员权限：" + to_string(isRunAsAdmin()));
            printDebugInfo("系统路径长度：" + to_string(MAX_PATH));
            cout << "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n";
            system("pause");
        }
        else if (command == "egg") {
            SetConsoleTextAttribute(hConsole, FOREGROUND_RED | FOREGROUND_GREEN | FOREGROUND_BLUE | FOREGROUND_INTENSITY);
            cout << "\n";
            cout << "┌─────────────────────────────────────────────────┐\n";
            cout << "│                                                 │\n";
            cout << "│   🍳 复活节彩蛋！   │\n";
            cout << "│                                                 │\n";
            cout << "│   感谢您使用本软件！   │\n";
            cout << "│                                                 │\n";
            cout << "└─────────────────────────────────────────────────┘\n";
            system("pause");
        }
        else {
            SetConsoleTextAttribute(hConsole, FOREGROUND_RED);
            cout << "\n未知命令！请重新输入。\n";
            system("pause");
        }
    }

    system("pause");
    return 0;
}
```

突然想起来，老师如果要只抽男女怎么办？（其次手动动画太丑了啊！

于是

```cpp
#include <iostream>
#include <vector>
#include <string>
#include <fstream>
#include <algorithm>
#include <thread>
#include <chrono>
#include <random>
#include <iomanip>
#include <limits>
#include <ctime>
#include <cctype>
#include <cstdlib>
#include <Windows.h>

using namespace std;

const string APP_NAME = "韶关市中等职业技术学校信建2502班专用随机点名软件";
const string APP_VERSION = "v0.0.2";
const string MALE_FILE_PATH = "D:\\2502sjdm\\n.txt";
const string FEMALE_FILE_PATH = "D:\\2502sjdm\\s.txt";
const string SAVE_FILE_NAME = "点名结果.txt";

const int ANIMATION_COUNT = 20;
const int ANIMATION_DELAY_MS = 50;
const int NAME_MAX_LENGTH = 8;

// #6cf（浅青色）加粗颜色定义（兼容所有Windows编译器）
const WORD NAME_COLOR = FOREGROUND_GREEN | FOREGROUND_BLUE | FOREGROUND_INTENSITY;

class Utils {
public:
    static string trim(const string& str) {
        size_t start = str.find_first_not_of(" \t\n\r");
        size_t end = str.find_last_not_of(" \t\n\r");
        return (start == string::npos || end == string::npos) ? "" : str.substr(start, end - start + 1);
    }

    static string toLower(const string& str) {
        string res = str;
        transform(res.begin(), res.end(), res.begin(), ::tolower);
        return res;
    }

    static void printError(const string& msg) {
        cerr << "? " << msg << "！" << endl;
    }

    static bool exists(const string& path) {
        ifstream file(path);
        return file.good();
    }

    static bool checkDirectory(const string& dirPath) {
        string testPath = dirPath + "\\.test_exists";
        ofstream testFile(testPath);
        bool isDir = testFile.good();
        testFile.close();
        if (isDir) remove(testPath.c_str());
        if (!isDir) cerr << "403 目录不存在或无权限：" << dirPath << endl;
        return isDir;
    }

    static string centerAlign(const string& str, int width) {
        if (str.length() >= width) return str;
        int leftPad = (width - str.length()) / 2;
        int rightPad = width - str.length() - leftPad;
        return string(leftPad, ' ') + str + string(rightPad, ' ');
    }

    // 设置控制台文本颜色
    static void setConsoleColor(WORD color) {
        SetConsoleTextAttribute(GetStdHandle(STD_OUTPUT_HANDLE), color);
    }

    // 生成ASCII框线
    static string generateLine(char c, int length) {
        return string(length, c);
    }
};

class NameListManager {
private:
    vector<string> maleNames;
    vector<string> femaleNames;

public:
    bool loadNames() {
        string maleDir = MALE_FILE_PATH.substr(0, MALE_FILE_PATH.find_last_of("\\"));
        string femaleDir = FEMALE_FILE_PATH.substr(0, FEMALE_FILE_PATH.find_last_of("\\"));

        if (!Utils::checkDirectory(maleDir) || !Utils::checkDirectory(femaleDir)) {
            return false;
        }

        if (!loadSingleFile(MALE_FILE_PATH, maleNames)) {
            return false;
        }

        if (!loadSingleFile(FEMALE_FILE_PATH, femaleNames)) {
            return false;
        }

        return true;
    }

    bool loadSingleFile(const string& path, vector<string>& names) {
        if file(path);
        if (!file.is_open()) {
            Utils::printError("无法打开文件 " + path);
            return false;
        }

        string line;
        while (getline(file, line)) {
            string trimmed = Utils::trim(line);
            if (!trimmed.empty()) {
                names.push_back(trimmed);
            }
        }

        file.close();
        return true;
    }

    const vector<string>& getMaleNames() const {
        return maleNames;
    }

    const vector<string>& getFemaleNames() const {
        return femaleNames;
    }

    int getTotalCount() const {
        return maleNames.size() + femaleNames.size();
    }

    int getMaleCount() const {
        return maleNames.size();
    }

    int getFemaleCount() const {
        return femaleNames.size();
    }
};

class RollCallApp {
private:
    NameListManager manager;
    random_device rd;
    mt19937 gen;

public:
    RollCallApp() : gen(rd()) {
        if (!manager.loadNames()) {
            Utils::printError("加载名单文件失败，程序无法启动");
            exit(1);
        }
    }

    void run() {
        SetConsoleTitleA((APP_NAME + " " + APP_VERSION).c_str());

        while (true) {
            system("cls");
            showHeader();
            showStats();

            string command;
            cout << "\n请输入命令：";
            getline(cin, command);
            command = Utils::toLower(Utils::trim(command));

            if (command == "q") {
                break;
            }
            else if (command == "h") {
                showHelp();
            }
            else if (command == "s") {
                showAllNames();
            }
            else if (command == "m") {
                randomSelectSingle(manager.getMaleNames(), "男生");
            }
            else if (command == "f") {
                randomSelectSingle(manager.getFemaleNames(), "女生");
            }
            else if (command == "a") {
                randomSelectAll();
            }
            else if (!command.empty() && all_of(command.begin(), command.end(), ::isdigit)) {
                int count = stoi(command);
                randomSelectMultiple(count);
            }
            else if (command == "egg") {
                EasterEgg();
            }
            else {
                Utils::printError("未知命令，请输入 h 查看帮助");
            }

            if (command != "q") {
                cout << "\n按任意键继续...";
                system("pause>nul");
            }
        }
    }

private:
    void showHeader() {
        Utils::setConsoleColor(FOROUND_GREEN | FOROUND_GREEN | FOROUND_BLUE | FOROUND_INTENSITY);
        cout << "┌" + Utils::generateLine('─', 58) + "┐\n";
        cout << "│" + Utils::centerAlign(APP_NAME, 58) + "│\n";
        cout << "│" + Utils::centerAlign(APP_VERSION, 58) + "│\n";
        cout << "└" + Utils::generateLine('─', 58) + "┘\n";
    }

    void showStats() {
        Utils::setConsoleColor(FOROUND_RED | FOROUND_GREEN | FOROUND_BLUE);
        cout << "\n";
        cout << "统计信息:\n";
        cout << "├─ 男生人数: " << manager.getMaleCount() << "\n";
        cout << "├─ 女生人数: " << manager.getFemaleCount() << "\n";
        cout << "└─ 总人数: " << manager.getTotalCount() << "\n";
        cout << "\n";

        Utils::setConsoleColor(FOROUND_BLUE | FOROUND_RED | FOROUND_GREEN | FOROUND_GREEN | FOROUND_BLUE);
        cout << "可用命令:\n";
        cout << "├─ s      - 显示完整名单\n";
        cout << "├─ m      - 随机抽取男生\n";
        cout << "├─ f      - 随机抽取女生\n";
        cout << "├─ a      - 随机抽取全部\n";
        cout << "├─ p+数字 - 批量抽取多人\n";
        cout << "├─ h      - 显示帮助信息\n";
        cout << "├─ q      - 退出程序\n";
    }

    void showAllNames() {
        system("cls");
        showHeader();

        Utils::setConsoleColor(FOROUND_RED | FOROUND_GREEN | FOROUND_BLUE);
        cout << "\n";
        cout << "男生名单:\n";
        printNameList(manager.getMaleNames());
        cout << "\n";
        cout << "女生名单:\n";
        printNameList(manager.getFemaleNames());
    }

    void printNameList(const vector<string>& names) {
        Utils::setConsoleColor(FOROUND_RED | FOROUND_RED | FOROUND_BLUE);
        for (size_t i = 0; i < names.size(); i++) {
            cout << setw(3) << (i + 1) << ". " << names[i] << "\n";
        }
    }

    void randomSelectSingle(const vector<string>& names, const string& type) {
        if (names.empty()) {
            Utils::printError(type + "名单为空");
            return;
        }

        system("cls");
        showHeader();
        showSelectionAnimation(names);

        uniform_int_distribution<> dis(0, names.size() - 1);
        int selected = dis(gen);

        Utils::setConsoleColor(NAME_COLOR);
        cout << "\n";
        cout << "┌" + Utils::generateLine('─', 58) + "┐\n";
        cout << "│" + Utils::centerAlign("抽中：" + names[selected], 58) + "│\n";
        cout << "│" + Utils::centerAlign("类型：" + type, 58) + "│\n";
        cout << "└" + Utils::generateLine('─', 58) + "┘\n";

        saveResult(names[selected], type);
    }

    void randomSelectAll() {
        uniform_int_distribution<> dis(0, manager.getMaleCount() + manager.getFemaleCount() - 1);
        int selected = dis(gen);

        if (selected < manager.getMaleCount()) {
            randomSelectSingle(manager.getMaleNames(), "男生");
        }
        else {
            randomSelectSingle(manager.getFemaleNames(), "女生");
        }
    }

    void randomSelectMultiple(int count) {
        if (count < 1 || count > 10) {
            Utils::printError("批量抽取人数范围为 1-10");
            return;
        }

        vector<string> allNames = getCombinedNames();
        if (allNames.size() < count) {
            Utils::printError("名单人数不足，无法抽取 " + to_string(count) + " 人");
            return;
        }

        system("cls");
        showHeader();

        Utils::setConsoleColor(FOROUND_BLUE | FOROUND_GREEN | FOROUND_RED | FOROUND_INTENSITY);
        cout << "\n";
        cout << "┌" + Utils::generateLine('─', 58) + "┐\n";
        cout << "│" + Utils::centerAlign("批量抽取 " + to_string(count) + " 人", 58) + "│\n";
        cout << "└" + Utils::generateLine('─', 58) + "┘\n";

        shuffle(allNames.begin(), allNames.end(), gen);
        vector<string> selectedNames(allNames.begin(), allNames.begin() + count);

        Utils::setConsoleColor(NAME_COLOR);
        cout << "\n";
        cout << "抽中名单:\n";
        for (size_t i = 0; i < selectedNames.size(); i++) {
            cout << " " << (i + 1) << ". " << selectedNames[i] << "\n";
        }

        saveBatchResult(selectedNames);
    }

    vector<string> getCombinedNames() {
        vector<string> result = manager.getMaleNames();
        vector<string> females = manager.getFemaleNames();
        result.insert(result.end(), females.begin(), females.end());
        return result;
    }

    void showSelectionAnimation(const vector<string>& names) {
        uniform_int_distribution<> dis(0, names.size() - 1);

        Utils::setConsoleColor(FOROUND_RED | FOROUND_GREEN | FOROUND_BLUE | FOROUND_INTENSITY);
        cout << "\n";
        cout << "┌" + Utils::generateLine('─', 58) + "┐\n";

        for (int i = 0; i < ANIMATION_COUNT; i++) {
            cout << "│" + Utils::centerAlign("抽选中... " + names[dis(gen)], 58) + "│\n";
            this_thread::sleep_for(chrono::milliseconds(ANIMATION_DELAY_MS));
        }

        cout << "└" + Utils::generateLine('─', 58) + "┘\n";
    }

    void saveResult(const string& name, const string& type) {
        ofstream file(SAVE_FILE_NAME, ios::app);
        if (file.is_open()) {
            time_t now = time(nullptr);
            tm* localTime = localtime(&now);
            file << "[" << put_time(localTime, "%Y-%m-%d %H:%M:%S") << "] 抽中：" << name << "（" << type << "）\n";
            file.close();
        }
    }

    void saveBatchResult(const vector<string>& names) {
        ofstream file(SAVE_FILE_NAME, ios::app);
        if (file.is_open()) {
            time_t now = time(nullptr);
            tm* localTime = localtime(&now);
            file << "[" << put_time(localTime, "%Y-%m-%d %H:%M:%S") << "] 批量抽取" << names.size() << "人：";
            for (size_t i = 0; i < names.size(); i++) {
                file << names[i] << (i < names.size() - 1 ? "、" : "");
            }
            file << "\n";
            file.close();
        }
    }

    void EasterEgg() {
        Utils::setConsoleColor(FOROUND_RED | FOROUND_GREEN | FOROUND_BLUE | FOROUND_INTENSITY);
        cout << "\n";
        cout << "┌" + Utils::generateLine('─', 58) + "┐\n";
        cout << "│" + Utils::centerAlign("🍳 复活节彩蛋！", 58) + "│\n";
        cout << "│" + Utils::centerAlign("感谢您使用本软件！", 58) + "│\n";
        cout << "└" + Utils::generateLine('─', 58) + "┘\n";
    }

    void EasterEgg() {
        Utils::setConsoleColor(FOROUND_RED | FOROUND_GREEN | FOROUND_BLUE | FOROUND_INTENSITY);
        cout << "\n";
        cout << "┌" + Utils::generateLine('─', 58) + "┐\n";
        cout << "│" + Utils::centerAlign("🍳 复活节彩蛋！", 58) + "│\n";
        cout << "│" + Utils::centerAlign("感谢您使用本软件！", 58) + "│\n";
        cout << "└" + Utils::generateLine('─', 58) + "┘\n";
    }
};

int main() {
    RollCallApp app;
    app.run();
    return 0;
}
```

| 分析维度 | 版本 0.0.1 (第一个代码段) | 版本 0.0.2 (第二个代码段) | 主要升级点分析 |
|---------|-------------------------|-------------------------|-------------|
| 架构与设计 | 面向过程。功能集中在一个主文件，通过全局变量和函数实现。 | 面向对象。引入了 `RollCallApp`、`NameListManager`、`Utils` 等类，职责分离清晰。 | 提升了代码的模块化、可维护性和可扩展性。新架构更易于理解和后续开发。 |
| 核心功能 | 单一列表随机抽取。从一个名单文件读取所有名字。 | 分类与批量抽取。<br>1. 性别分类：从 `n.txt`（男）和 `s.txt`（女）分别读取名单。<br>2. 范围选择：可指定抽取"全部"、"男生"或"女生"。<br>3. 批量抽取：输入数字可一次性抽取多人。 | 功能显著增强。支持按性别筛选和批量操作，实用性更强。 |
| 文件处理 | 复杂路径与编码处理。<br>- 尝试从"Program Files"和"我的文档"读取。<br>- 内置 UTF-8 到 GBK 的编码转换。 | 路径简化，编码隐式处理。<br>- 固定从 `D:\2502sjdm\` 读取。<br>- 依赖系统控制台编码，无显式转换。 | 去除了复杂的编码转换逻辑，降低了出错风险，但牺牲了路径灵活性。 |
| 代码质量与特性 | 基础功能。包含随机、保存、彩蛋、调试信息。 | 优化与增强。<br>- 动画效果：抽取时有名字快速切换的动画。<br>- 常量与配置：用常量定义路径、颜色等。<br>- 错误处理：有更明确的错误提示（如"403 目录不存在"）。<br>- 用户界面：提示信息更友好，如显示人数统计。 | 用户体验和代码健壮性得到优化。动画和更好的提示提升了交互体验。 |

一编译，能跑，但有编译报错，我看不得任何报错，必须改

```cpp
#include <iostream>
#include <vector>
#include <string>
#include <fstream>
#include <algorithm>
#include <thread>
#include <chrono>
#include <random>
#include <iomanip>
#include <limits>
#include <ctime>
#include <cctype>
#include <cstdlib>
#include <Windows.h>

using namespace std;

const string APP_NAME = "韶关市中等职业技术学校信建2502班专用随机点名软件";
const string APP_VERSION = "v0.0.3";
const string MALE_FILE_PATH = "D:\\2502sjdm\\n.txt";
const string FEMALE_FILE_PATH = "D:\\2502sjdm\\s.txt";
const string SAVE_FILE_NAME = "点名结果.txt";

const int ANIMATION_COUNT = 20;
const int ANIMATION_DELAY_MS = 50;
const size_t NAME_MAX_LENGTH = 8;  // 改为 size_t 类型

// #6cf（浅青色）加粗颜色定义
const WORD NAME_COLOR = FOREGROUND_GREEN | FOROUND_GREEN | FOROUND_BLUE | FOROUND_BLUE | FOROUND_INTENSITY;

class Utils {
public:
    static string trim(const string& str) {
        size_t start = str.find_first_not_of(" \t\n\r");
        size_t end = str.find_last_not_of(" \t\n\r");
        return (start == string::npos || end == string::npos) ? "" : str.substr(start, end - start + 1);
    }

    static string toLower(const string& str) {
        string res = str;
        transform(res.begin(), res.end(), res.begin(), ::tolower);
        return res;
    }

    static void printError(const string& msg) {
        cerr << "? " << msg << "！" << endl;
    }

    static bool exists(const string& path) {
        ifstream file(path);
        return file.good();
    }

    static bool checkDirectory(const string& dirPath) {
        string testPath = dirPath + "\\.test_exists";
        ofstream testFile(testPath);
        bool isDir = testFile.good();
        testFile.close();
        if (isDir) remove(testPath.c_str());
        if (!isDir) cerr << "403 目录不存在或无权限：" << dirPath << endl;
        return isDir;
    }

    static string centerAlign(const string& str, size_t width) {  // 参数改为 size_t
        size_t strLength = str.length();
        if (strLength >= width) return str;
        size_t leftPad = (width - strLength) / 2;
        size_t rightPad = width - strLength - leftPad;
        return string(leftPad, ' ') + str + string(rightPad, ' ');
    }

    // 设置控制台文本颜色
    static void setConsoleColor(WORD color) {
        SetConsoleTextAttribute(GetStdHandle(STD_OUTPUT_HANDLE), color);
    }

    // 生成ASCII框线
    static string generateLine(char c, int length) {
        return string(length, c);
    }
};

class NameListManager {
private:
    vector<string> maleNames;
    vector<string> femaleNames;

public:
    bool loadNames() {
        string maleDir = MALE_FILE_PATH.substr(0, MALE_FILE_PATH.find_last_of("\\"));
        string femaleDir = FEMALE_FILE_PATH.substr(0, FEMALE_FILE_PATH.find_last_of("\\"));

        if (!Utils::checkDirectory(maleDir) || !Utils::checkDirectory(femaleDir)) {
            return false;
        }

        if (!loadSingleFile(MALE_FILE_PATH, maleNames)) {
            return false;
        }

        if (!loadSingleFile(FEMALE_FILE_PATH, femaleNames)) {
            return false;
        }

        return true;
    }

    bool loadSingleFile(const string& path, vector<string>& names) {
        ifstream file(path);
        if (!file.is_open()) {
            Utils::printError("无法打开文件 " + path);
            return false;
        }

        string line;
        while (getline(file, line)) {
            string trimmed = Utils::trim(line);
            if (!trimmed.empty()) {
                names.push_back(trimmed);
            }
        }

        file.close();
        return true;
    }

    const vector<string>& getMaleNames() const {
        return maleNames;
    }

    const vector<string>& getFemaleNames() const {
        return femaleNames;
    }

    int getTotalCount() const {
        return maleNames.size() + femaleNames.size();
    }

    int getMaleCount() const {
        return maleNames.size();
    }

    int getFemaleCount() const {
        return femaleNames.size();
    }
};

class RollCallApp {
private:
    NameListManager manager;
    random_device rd;
    mt19937 gen;

public:
    RollCallApp() : gen(rd()) {
        if (!manager.loadNames()) {
            Utils::printError("加载名单文件失败，程序无法启动");
            exit(1);
        }
    }

    void run() {
        SetConsoleTitleA((APP_NAME + " " + APP_VERSION).c_str());

        while (true) {
            system("cls");
            showHeader();
            showStats();

            string command;
            cout << "\n请输入命令：";
            getline(cin, command);
            command = Utils::toLower(Utils::trim(command));

            if (command == "q") {
                break;
            }
            else if (command == "h") {
                showHelp();
            }
            else if (command == "s") {
                showAllNames();
            }
            else if (command == "m") {
                randomSelectSingle(manager.getMaleNames(), "男生");
            }
            else if (command == "f") {
                randomSelectSingle(manager.getFemaleNames(), "女生");
            }
            else if (command == "a") {
                randomSelectAll();
            }
            else if (!command.empty() && all_of(command.begin(), command.end(), ::isdigit)) {
                int count = stoi(command);
                randomSelectMultiple(count);
            }
            else {
                Utils::printError("未知命令，请输入 h 查看帮助");
            }

            if (command != "q") {
                cout << "\n按任意键继续...";
                system("pause>nul");
            }
        }
    }

private:
    void showHeader() {
        Utils::setConsoleColor(FOROUND_RED | FOROUND_RED | FOROUND_GREEN | FOROUND_GREEN | FOROUND_BLUE | FOROUND_INTENSITY);
        cout << "┌" + Utils::generateLine('─', 58) + "┐\n";
        cout << "│" + Utils::centerAlign(APP_NAME, 58) + "│\n";
        cout << "│" + Utils::centerAlign(APP_VERSION, 58) + "│\n";
        cout << "└" + Utils::generateLine('─', 58) + "┘\n";
    }

    void showStats() {
        Utils::setConsoleColor(FOROUND_RED | FOROUND_RED | FOROUND_GREEN | FOROUND_BLUE);
        cout << "\n";
        cout << "统计信息:\n";
        cout << "├─ 男生人数: " << manager.getMaleCount() << "\n";
        cout << "├─ 女生人数: " << manager.getFemaleCount() << "\n";
        cout << "└─ 总人数: " << manager.getTotalCount() << "\n";
        cout << "\n";

        Utils::setConsoleColor(FOROUND_RED | FOROUND_GREEN | FOROUND_BLUE | FOROUND_INTENSITY);
        cout << "可用命令:\n";
        cout << "├─ s      - 显示完整名单\n";
        cout << "├─ m      - 随机抽取男生\n";
        cout << "├─ f      - 随机抽取女生\n";
        cout << "├─ a      - 随机抽取全部\n";
        cout << "├─ 输入数字 - 批量抽取多人\n";
        cout << "├─ h      - 显示帮助信息\n";
        cout << "├─ q      - 退出程序\n";
    }

    void showHelp() {
        system("cls");
        showHeader();

        Utils::setConsoleColor(FOROUND_RED | FOROUND_GREEN | FOROUND_BLUE);
        cout << "\n";
        cout << "帮助信息:\n";
        cout << "┌─────────────────────────────────────────────────┐\n";
        cout << "│  s      - 显示完整名单列表                      │\n";
        cout << "│  m      - 随机抽取一名男生                       │\n";
        cout << "│  f      - 随机抽取一名女生                       │\n";
        cout << "│  a      - 随机抽取一名学生（不分性别）           │\n";
        cout << "│  数字   - 输入数字（1-10）批量抽取多人          │\n";
        cout << "│  h      - 显示此帮助信息                        │\n";
        cout << "│  q      - 退出程序                             │\n";
        cout << "└─────────────────────────────────────────────────┘\n";
    }

    void showAllNames() {
        system("cls");
        showHeader();

        Utils::setConsoleColor(FOROUND_RED | FOROUND_RED | FOROUND_RED | FOROUND_BLUE | FOROUND_BLUE | FOROUND_INTENSITY);
        cout << "\n";
        cout << "男生名单:\n";
        printNameList(manager.getMaleNames());
        cout << "\n";
        cout << "女生名单:\n";
        printNameList(manager.getFemaleNames());
    }

    void printNameList(const vector<string>& names) {
        Utils::setConsoleColor(FOROUND_RED | FOROUND_RED | FOROUND_RED | FOROUND_GREEN | FOROUND_BLUE | FOROUND_BLUE);
        for (size_t i = 0; i < names.size(); i++) {
            cout << setw(3) << (i + 1) << ". " << names[i] << "\n";
        }
    }

    void randomSelectSingle(const vector<string>& names, const string& type) {
        if (names.empty()) {
            Utils::printError(type + "名单为空");
            return;
        }

        system("cls");
        showHeader();
        playSelectionAnimation(names);

        uniform_int_distribution<> dis(0, static_cast<int>(names.size()) - 1);  // 显式转换
        int selected = dis(gen);

        Utils::setConsoleColor(NAME_COLOR);
        cout << "\n";
        cout << "┌" + Utils::generateLine('─', 58) + "┐\n";
        cout << "│" + Utils::centerAlign("抽中：" + names[selected], 58) + "│\n";
        cout << "│" + Utils::centerAlign("类型：" + type, 58) + "│\n";
        cout << "└" + Utils::generateLine('─', 58) + "┘\n";

        saveResult(names[selected], type);
    }

    void randomSelectAll() {
        uniform_int_distribution<> dis(0, static_cast<int>(manager.getMaleCount() + manager.getFemaleCount()) - 1);  // 显式转换
        int selected = dis(gen);

        if (selected < manager.getMaleCount()) {
            randomSelectSingle(manager.getMaleNames(), "男生");
        }
        else {
            randomSelectSingle(manager.getFemaleNames(), "女生");
        }
    }

    void randomSelectMultiple(int count) {
        if (count < 1 || count > 10) {
            Utils::printError("批量抽取人数范围为 1-10");
            return;
        }

        vector<string> allNames = getCombinedNames();
        if (allNames.size() < count) {
            Utils::printError("名单人数不足，无法抽取 " + to_string(count) + " 人");
            return;
        }

        system("cls");
        showHeader();

        Utils::setConsoleColor(FOROUND_RED | FOROUND_RED | FOROUND_GREEN | FOROUND_BLUE | FOROUND_INTENSITY);
        cout << "\n";
        cout << "┌" + Utils::generateLine('─', 58) + "┐\n";
        cout << "│" + Utils::centerAlign("批量抽取 " + to_string(count) + " 人", 58) + "│\n";
        cout << "└" + Utils::generateLine('─', 58) + "┘\n";

        shuffle(allNames.begin(), allNames.end(), gen);
        vector<string> selectedNames(allNames.begin(), allNames.begin() + count);

        Utils::setConsoleColor(NAME_COLOR);
        cout << "\n";
        cout << "抽中名单:\n";
        for (size_t i = 0; i < selectedNames.size(); i++) {
            cout << " " << (i + 1) << ". " << selectedNames[i] << "\n";
        }

        saveBatchResult(selectedNames);
    }

    vector<string> getCombinedNames() {
        vector<string> result = manager.getMaleNames();
        vector<string> females = manager.getFemaleNames();
        result.insert(result.end(), females.begin(), females.end());
        return result;
    }

    void playSelectionAnimation(const vector<string>& names) {
        uniform_int_distribution<> dis(0, static_cast<int>(names.size()) - 1);  // 显式转换

        Utils::setConsoleColor(FOROUND_RED | FOROUND_GREEN | FOROUND_BLUE | FOROUND_INTENSITY);
        cout << "\n";
        cout << "┌" + Utils::generateLine('─', 58) + "┐\n";

        for (int i = 0; i < ANIMATION_COUNT; i++) {
            cout << "│" + Utils::centerAlign("抽选中... " + names[dis(gen)], 58) + "│\n";
            this_thread::sleep_for(chrono::milliseconds(ANIMATION_DELAY_MS));
        }

        cout << "└" + Utils::generateLine('─', 58) + "┘\n";
    }

    void saveResult(const string& name, const string& type) {
        ofstream file(SAVE_FILE_NAME, ios::app);
        if (file.is_open()) {
            time_t now = time(nullptr);
            tm* localTime = localtime(&now);
            file << "[" << put_time(localTime, "%Y-%m-%d %H:%M:%S") << "] 抽中：" << name << "（" << type << "）\n";
            file.close();
        }
    }

    void saveBatchResult(const vector<string>& names) {
        ofstream file(SAVE_FILE_NAME, ios::app);
        if (file.is_open()) {
            time_t now = time(nullptr);
            tm* localTime = localtime(&now);
            file << "[" << put_time(localTime, "%Y-%m-%d %H:%M:%S") << "] 批量抽取" << names.size() << "人：";
            for (size_t i = 0; i < names.size(); i++) {
                file << names[i] << (i < names.size() - 1 ? "、" : "");
            }
            file << "\n";
            file.close();
        }
    }
};

int main() {
    RollCallApp app;
    app.run();
    return 0;
}
```

| 变更类别 | 变更位置 | v0.0.2 版本 | v0.0.3 版本 | 升级点分析 |
|---------|---------|-----------|-----------|-----------|
| 版本标识 | 常量 `APP_VERSION` | "v0.0.2" | "v0.0.3" | 更新了软件版本号。 |
| 常量类型优化 | 常量 `NAME_MAX_LENGTH` | `const int NAME_MAX_LENGTH = 8;` | `const size_t NAME_MAX_LENGTH = 8;` | 将与字符串长度相关的常量类型改为 `size_t`，与标准库函数（如`string::length()`）返回值类型保持一致，提高了类型安全性和代码一致性。 |
| 函数参数匹配 | `Utils::centerAlign` 方法参数 | `int width` | `size_t width` | 配合上述常量类型的修改，消除了潜在的隐式类型转换警告。 |
| 显式类型转换 | `RollCallApp::playSelectionAnimation` 方法 | `setw(NAME_MAX_LENGTH)` | `setw(static_cast<int>(NAME_MAX_LENGTH))` | `setw` 期望 `int` 类型参数。将 `size_t` 类型的常量显式转换为 `int`，避免了编译器的类型不匹配警告。 |
| 显式类型转换 | `RollCallApp::randomSelectSingle` 方法 | `dis(0, names.size() - 1)` | `dis(0, static_cast<int>(names.size()) - 1)` | `uniform_int_distribution<>` 默认使用 `int` 类型。将 `size_t` 显式转换为 `int`，同样是为了消除编译器警告，确保随机数生成的类型安全。 |
| 功能移除 | `RollCallApp::handleCommand` 方法 | 包含对 `"egg"` 或 `"easter"` 命令的处理分支。 | 已删除 彩蛋命令的处理分支。 | 移除了彩蛋功能。 |

这个时候是老师用到的的一个版本，说要给他们班上的电脑也搞一个

得~0.0.4横空出世

```cpp
#include <iostream>
#include <vector>
#include <string>
#include <fstream>
#include <algorithm>
#include <thread>
#include <chrono>
#include <random>
#include <iomanip>
#include <limits>
#include <ctime>
#include <cctype>
#include <cstdlib>
#include <Windows.h>

using namespace std;

const string APP_NAME = "韶关市中等职业技术学校信建2503班专用随机点名软件";
const string APP_VERSION = "v0.0.4";
const string MALE_FILE_PATH = "D:\\2503sjdm\\n.txt";
const string FEMALE_FILE_PATH = "D:\\2503sjdm\\s.txt";
const string SAVE_FILE_NAME = "点名结果.txt";

const int ANIMATION_COUNT = 20;
const int ANIMATION_DELAY_MS = 50;
const size_t NAME_MAX_LENGTH = 4;
const int BATCH_ITEM_WIDTH = 8;  // 每个名字显示宽度（含空格）
const int MAX_COLUMNS = 6;  // 每行最多显示6个名字

// #6cf（浅青色）加粗颜色定义
const WORD NAME_COLOR = FOROUND_RED | FOROUND_GREEN | FOROUND_BLUE | FOROUND_BLUE | FOROUND_INTENSITY;

class Utils {
public:
    static string trim(const string& str) {
        size_t start = str.find_first_not_of(" \t\n\r");
        size_t end = str.find_last_not_of(" \t\n\r");
        return (start == string::npos || end == string::npos) ? "" : str.substr(start, end - start + 1);
    }

    static string toLower(const string& str) {
        string res = str;
        transform(res.begin(), res.end(), res.begin(), ::tolower);
        return res;
    }

    static void printError(const string& msg) {
        cerr << "? " << msg << "！" << endl;
    }

    static bool exists(const string& path) {
        ifstream file(path);
        return file.good();
    }

    static bool checkDirectory(const string& dirPath) {
        string testPath = dirPath + "\\.test_exists";
        ofstream testFile(testPath);
        bool isDir = testFile.good();
        testFile.close();
        if (isDir) remove(testPath.c_str());
        return isDir;
    }

    static string centerAlign(const string& str, size_t width) {
        size_t strLength = str.length();
        if (strLength >= width) return str;
        size_t leftPad = (width - strLength) / 2;
        size_t rightPad = width - strLength - leftPad;
        return string(leftPad, ' ') + str + string(rightPad, ' ');
    }

    // 设置控制台文本颜色
    static void setConsoleColor(WORD color) {
        SetConsoleTextAttribute(GetStdHandle(STD_OUTPUT_HANDLE), color);
    }

    // 生成ASCII框线
    static string generateLine(char c, int length) {
        return string(length, c);
    }
};

class NameListManager {
private:
    vector<string> maleNames;
    vector<string> femaleNames;

public:
    bool loadNames() {
        string maleDir = MALE_FILE_PATH.substr(0, MALE_FILE_PATH.find_last_of("\\"));
        string femaleDir = FEMALE_FILE_PATH.substr(0, FEMALE_FILE_PATH.find_last_of("\\"));

        if (!Utils::checkDirectory(maleDir) || !Utils::checkDirectory(femaleDir)) {
            return false;
        }

        if (!loadSingleFile(MALE_FILE_PATH, maleNames)) {
            return false;
        }

        if (!loadSingleFile(FEMALE_FILE_PATH, femaleNames)) {
            return false;
        }

        return true;
    }

    bool loadSingleFile(const string& path, vector<string>& names) {
        ifstream file(path);
        if (!file.is_open()) {
            Utils::printError("无法打开文件 " + path);
            return false;
        }

        string line;
        while (getline(file, line)) {
            string trimmed = Utils::trim(line);
            if (!trimmed.empty()) {
                names.push_back(trimmed);
            }
        }

        file.close();
        return true;
    }

    const vector<string>& getMaleNames() const {
        return maleNames;
    }

    const vector<string>& getFemaleNames() const {
        return femaleNames;
    }

    int getTotalCount() const {
        return maleNames.size() + femaleNames.size();
    }

    int getMaleCount() const {
        return maleNames.size();
    }

    int getFemaleCount() const {
        return femaleNames.size();
    }
};

class RollCallApp {
private:
    NameListManager manager;
    random_device rd;
    mt19937 gen;

public:
    RollCallApp() : gen(rd()) {
        if (!manager.loadNames()) {
            Utils::printError("加载名单文件失败，程序无法启动");
            exit(1);
        }
    }

    void run() {
        SetConsoleTitleA((APP_NAME + " " + APP_VERSION).c_str());

        while (true) {
            system("cls");
            showHeader();
            showStats();

            string command;
            cout << "\n请输入命令：";
            getline(cin, command);
            command = Utils::toLower(Utils::trim(command));

            if (command == "q") {
                break;
            }
            else if (command == "h") {
                showHelp();
            }
            else if (command == "s") {
                showAllNames();
            }
            else if (command == "m") {
                randomSelectSingle(manager.getMaleNames(), "男生");
            }
            else if (command == "f") {
                randomSelectSingle(manager.getFemaleNames(), "女生");
            }
            else if (command == "a") {
                randomSelectAll();
            }
            else if (command.find("p") == 0 && command.size() > 1) {
                string numPart = command.substr(1);
                if (all_of(numPart.begin(), numPart.end(), ::isdigit)) {
                    int count = stoi(numPart);
                    randomSelectMultiple(count);
                }
                else {
                    Utils::printError("无效的批量命令格式，请使用 p+数字 格式");
                }
            }
            else {
                Utils::printError("未知命令，请输入 h 查看帮助");
            }

            if (command != "q") {
                cout << "\n按任意键继续...";
                system("pause>nul");
            }
        }
    }

private:
    void showHeader() {
        Utils::setConsoleColor(FOROUND_RED | FOROUND_RED | FOROUND_GREEN | FOROUND_GREEN | FOROUND_BLUE | FOROUND_INTENSITY);
        cout << "┌" + Utils::generateLine('─', 58) + "┐\n";
        cout << "│" + Utils::centerAlign(APP_NAME, 58) + "│\n";
        cout << "│" + Utils::centerAlign(APP_VERSION, 58) + "│\n";
        cout << "└" + Utils::generateLine('─', 58) + "┘\n";
    }

    void showStats() {
        Utils::setConsoleColor(FOROUND_RED | FOROUND_RED | FOROUND_RED | FOROUND_GREEN | FOROUND_BLUE);
        cout << "\n";
        cout << "统计信息:\n";
        cout << "├─ 男生人数: " << manager.getMaleCount() << "\n";
        cout << "├─ 女生人数: " << manager.getFemaleCount() << "\n";
        cout << "└─ 总人数: " << manager.getTotalCount() << "\n";
        cout << "\n";

        Utils::setConsoleColor(FOROUND_RED | FOROUND_RED | FOROUND_GREEN | FOROUND_BLUE | FOROUND_INTENSITY);
        cout << "可用命令:\n";
        cout << "├─ s      - 显示完整名单\n";
        cout << "├─ m      - 随机抽取男生\n";
        cout << "├─ f      - 随机抽取女生\n";
        cout << "├─ a      - 随机抽取全部\n";
        cout << "├─ p+数字 - 批量抽取多人\n";
        cout << "├─ h      - 显示帮助信息\n";
        cout << "├─ q      - 退出程序\n";
    }

    void showHelp() {
        system("cls");
        showHeader();

        Utils::setConsoleColor(FOROUND_RED | FOROUND_RED | FOROUND_RED | FOROUND_GREEN | FOROUND_BLUE);
        cout << "\n";
        cout << "帮助信息:\n";
        cout << "┌─────────────────────────────────────────────────┐\n";
        cout << "│  s      - 显示完整名单列表                      │\n";
        cout << "│  m      - 随机抽取一名男生                       │\n";
        cout << "│  f      - 随机抽取一名女生                       │\n";
        cout << "│  a      - 随机抽取一名学生（不分性别）           │\n";
        cout << "│  p+数字 - 批量抽取多人（如 p5 表示抽取5人）    │\n";
        cout << "│  h      - 显示此帮助信息                        │\n";
        cout << "│  q      - 退出程序                             │\n";
        cout << "└─────────────────────────────────────────────────┘\n";
    }

    void showAllNames() {
        system("cls");
        showHeader();

        Utils::setConsoleColor(FOROUND_RED | FOROUND_RED | FOROUND_RED | FOROUND_GREEN | FOROUND_BLUE | FOROUND_BLUE);
        cout << "\n";
        cout << "男生名单:\n";
        printNameList(manager.getMaleNames());
        cout << "\n";
        cout << "女生名单:\n";
        printNameList(manager.getFemaleNames());
    }

    void printNameList(const vector<string>& names) {
        Utils::setConsoleColor(FOROUND_RED | FOROUND_RED | FOROUND_RED | FOROUND_RED | FOROUND_GREEN | FOROUND_BLUE);
        for (size_t i = 0; i < names.size(); i++) {
            cout << setw(3) << (i + 1) << ". " << names[i] << "\n";
        }
    }

    void randomSelectSingle(const vector<string>& names, const string& type) {
        if (names.empty()) {
            Utils::printError(type + "名单为空");
            return;
        }

        system("cls");
        showHeader();
        playSelectionAnimation(names);

        uniform_int_distribution<> dis(0, static_cast<int>(names.size()) -