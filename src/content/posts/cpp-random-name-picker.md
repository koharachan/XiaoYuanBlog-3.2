---
title: "C++ 实践：写一个班级随机点名器"
published: 2025-11-21
updated: 2025-12-20
draft: false
description: "从一个“班级电脑不能登录点名软件”的小插曲开始，用 C++17 写一个读取名单、按性别筛选并支持批量抽取的 Windows 控制台点名器，附可编译的最终版本。"
image: /upload/image-LIRH-MWbk-yfre-cxiB.jpg
tags: ["C++", "Windows", "小工具", "实践记录"]
category: 外版
comment: true
---

老师想在班里的电脑上随机点名，我们先试了现成的点名软件，结果它要求登录；手机又不在手边，最后就变成了一个很适合练手的小项目：自己写一个能离线运行的点名器。

原稿里保留了很多从 0.0.1 到 0.0.4 的中间版本，代码越堆越长，反而看不清最后到底需要什么。这里只留下最后一版的核心功能：

- 从 `n.txt` 和 `s.txt` 读取名单；
- 选择全部、男生或女生；
- 一次抽取 1 人或多个人；
- 同一轮抽取不重复；
- 使用 `mt19937`，不再用 `time % 4` 充当随机数。

![程序运行截图](/upload/image-LIRH-MWbk-yfre-cxiB.jpg)
![程序界面](/upload/image-bjpS.jpg)
![点名结果](/upload/image-wKdT.jpg)

## 准备名单文件

把两个文本文件放在程序同一个目录下，每行写一个名字：

```text
# n.txt
张三
李四
王五
```

```text
# s.txt
小红
小兰
小雨
```

文件使用 UTF-8 保存。Windows 控制台如果显示中文乱码，可以先执行 `chcp 65001`，或者让编译器和终端统一使用 UTF-8。

## 完整代码

```cpp
#include <algorithm>
#include <fstream>
#include <iostream>
#include <random>
#include <string>
#include <vector>

#ifdef _WIN32
#include <windows.h>
#endif

std::string trim(const std::string& value) {
    const auto first = value.find_first_not_of(" \t\r\n");
    if (first == std::string::npos) return {};
    const auto last = value.find_last_not_of(" \t\r\n");
    return value.substr(first, last - first + 1);
}

std::vector<std::string> loadNames(const std::string& fileName) {
    std::ifstream file(fileName);
    if (!file) {
        std::cerr << "无法打开名单文件：" << fileName << "\n";
        return {};
    }

    std::vector<std::string> names;
    std::string line;
    while (std::getline(file, line)) {
        line = trim(line);
        if (!line.empty()) names.push_back(line);
    }
    return names;
}

std::vector<std::string> chooseGroup(
    const std::vector<std::string>& male,
    const std::vector<std::string>& female,
    int group
) {
    if (group == 1) return male;
    if (group == 2) return female;

    std::vector<std::string> all = male;
    all.insert(all.end(), female.begin(), female.end());
    return all;
}

int main() {
#ifdef _WIN32
    SetConsoleOutputCP(CP_UTF8);
    SetConsoleCP(CP_UTF8);
#endif

    const auto male = loadNames("n.txt");
    const auto female = loadNames("s.txt");
    if (male.empty() && female.empty()) {
        std::cerr << "两个名单文件都没有可用名字。\n";
        return 1;
    }

    std::cout << "选择范围：0. 全部  1. 男生  2. 女生\n> ";
    int group = 0;
    if (!(std::cin >> group) || group < 0 || group > 2) {
        std::cerr << "范围选项无效。\n";
        return 1;
    }

    auto candidates = chooseGroup(male, female, group);
    if (candidates.empty()) {
        std::cerr << "这个范围没有名单。\n";
        return 1;
    }

    std::cout << "抽取人数（1 - " << candidates.size() << "）：\n> ";
    std::size_t count = 0;
    if (!(std::cin >> count) || count == 0 || count > candidates.size()) {
        std::cerr << "人数无效。\n";
        return 1;
    }

    std::random_device seed;
    std::mt19937 engine(seed());
    std::shuffle(candidates.begin(), candidates.end(), engine);

    std::cout << "\n本次抽到：\n";
    for (std::size_t i = 0; i < count; ++i) {
        std::cout << i + 1 << ". " << candidates[i] << "\n";
    }
}
```

## 编译和运行

使用 MinGW-w64 或其他支持 C++17 的编译器：

```bat
chcp 65001
g++ -std=c++17 -O2 -Wall -Wextra main.cpp -o picker.exe
picker.exe
```

一个运行过程大概是：

```text
选择范围：0. 全部  1. 男生  2. 女生
> 0
抽取人数（1 - 6）：
> 2

本次抽到：
1. 小兰
2. 张三
```

`std::shuffle` 会先把候选名单打乱，再取前几个名字，所以一轮抽取中不会重复。下一次运行会重新使用随机种子，结果也不会固定。

## 这版和最初版本差在哪里

最开始的代码为了增加“功能感”，堆了动画、彩蛋、颜色、多个输入路径和几版重复实现，结果出现了 `ifstream` 使用不一致、帮助文本和实际参数不匹配、重复函数等问题。最后保留下来的版本反而简单很多：文件读取、范围选择、数量检查、随机打乱，四件事各自独立。

如果要继续做，可以再加：

- 抽取历史记录和导出 CSV；
- 用 `std::filesystem` 检查名单文件；
- 给名单加唯一 ID，避免同名同学被误判；
- 为“空文件、超出人数、重复名字、文件不存在”补自动化测试。

做这种班级小工具，先把输入格式和最终行为定清楚，比一开始就加一堆界面效果更重要。
