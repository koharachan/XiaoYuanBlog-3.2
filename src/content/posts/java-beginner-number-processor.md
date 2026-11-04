---
title: 从零开始编写数字处理程序：一个Java小白的完整指南
published: 2025-10-07
updated: 2025-10-07
draft: false
description: 
image: 
tags: ["教程","java"]
category: 外版
comment: true
---

本文将带你一步步实现一个功能完整的数字处理程序，涵盖输入处理、排序算法、去重操作和单调栈应用。即使你是Java新手，也能跟着这个指南完成编码。
## 程序概述

我们要编写的程序能够：

  - 自动检测系统语言（中英文）
  - 处理用户输入的数字
  - 随机选择排序算法进行排序
  - 去除重复数字
  - 使用单调栈进行特殊处理
  - 提供动画效果的执行过程
## 第一步：搭建基础框架

```java
// 定义入口点：main 是 Java 程序启始位
void main() {
    // 主逻辑占位：此处待实现功能
    // 当前空，表未写具体代
}

// 睡函 - 造延效果
// 入参：milliseconds - 线程停多长（毫秒）
void sleep(int milliseconds) {
    try {
        // 调 Thread.sleep，让当线程休指时长
        Thread.sleep(milliseconds);
    } catch (InterruptedException e) {
        // 若线程睡中被断，则恢其断状
        Thread.currentThread().interrupt();
    }
}

// 打印数组 - 以 [a,b,c] 格式输到控台
// 入参：arr - 要打的 int 型数组
void printArray(int[] arr) {
    System.out.print("[");              // 先打左括，表数组开
    for (int i = 0; i < arr.length; i++) { // 遍数每元
        System.out.print(arr[i]);       // 打当元
        if (i < arr.length - 1) {       // 判是为最一元
            System.out.print(",");      // 非末则加逗隔
        }
    }
    System.out.println("]");            // 打右括并换行，表数组束
}
```

**代码解释：**

  - `main()` 函数是程序入口点
  - `sleep()` 函数让程序暂停指定毫秒，创造动画效果
  - `printArray()` 函数以美观格式输出数组
## 第二步：实现语言检测和输入处理

```java
void main() {
    // 取系统语种（如：zh=中文，en=英文）
    String language = System.getProperty("user.language");
    // 判是否为中文环：zh 或 cn 即视为中
    boolean isChinese = "zh".equals(language) || "cn".equals(language);

    // 按语种显对应提语
    String input = readInput(isChinese ? "请输入数字: " : "Enter numbers: ");
    
    // 抽字串中所数，转为整数数
    int[] numbers = extractSingleDigits(input);
    
    // 原样打数组（带[ ]格式）
    printArray(numbers);
    // 停300毫秒，造延缓效
    sleep(300);
}

// 读用户输的一行文
// 入参：prompt - 提示语（中or英）
// 出参：用户输内（错时为空串）
String readInput(String prompt) {
    // 显提语不换行
    System.out.print(prompt);
    
    try {
        // 建读器，用读键输
        java.io.BufferedReader reader = new java.io.BufferedReader(
                new java.io.InputStreamReader(System.in));
        // 读一整并回
        return reader.readLine();
    } catch (Exception e) {
        // 出错（如IO异常）则回空串
        return "";
    }
}

// 抽字串中所单数，转为int数组
// 入参：input - 原始输字串
// 出参：只含数的整型数组
int[] extractSingleDigits(String input) {
    int count = 0; // 记数个数

    // 一遍历：数有几数
    for (int i = 0; i < input.length(); i++) {
        char c = input.charAt(i);           // 取当字
        if (c >= '0' && c <= '9') {         // 是0-9间？
            count++;                        // 是则计+1
        }
    }

    // 新数组，长=数个数
    int[] numbers = new int[count];
    int index = 0; // 数组写位指针

    // 二遍历：数抽整存数组
    for (int i = 0; i < input.length(); i++) {
        char c = input.charAt(i);                   // 取当字
        if (c >= '0' && c <= '9') {                 // 是数？
            numbers[index++] = c - '0';             // 转整存，指针++
        }
    }

    // 回抽完的数数组
    return numbers;
}
```

**代码解释：**

  - 使用 `System.getProperty("user.language")` 检测系统语言
  - `readInput()` 读取用户输入，支持中英文提示
  - `extractSingleDigits()` 从字符串中提取数字字符并转换为整数
## 第三步：实现排序算法

```java
// 随机选一排序法
// 出参：返回一个排序算名（如“冒泡排序”）
String selectRandomSort() {
    // 定义支持的四种排序法
    String[] sorts = {"冒泡排序", "快速排序", "选择排序", "归并排序"};
    // 用当前时间毫秒取模4，得0-3的索引
    int index = (int)(System.currentTimeMillis() % 4);
    // 返回随机选中的排序法名
    return sorts[index];
}

// 按指定排序法对数列排序
// 入参：numbers - 原数组；sortType - 排序类名
// 出参：已排序的新数组
int[] sortNumbers(int[] numbers, String sortType) {
    // 克隆原数组，避免修改原数据
    int[] sorted = numbers.clone();

    // 根据排序类名调对应算法
    switch (sortType) {
        case "冒泡排序":
            bubbleSort(sorted);           // 调冒泡
            break;
        case "快速排序":
            quickSort(sorted, 0, sorted.length - 1); // 调快排
            break;
        case "选择排序":
            selectionSort(sorted);        // 调选排
            break;
        case "归并排序":
            // 归并返新数组，需重赋值
            sorted = mergeSort(sorted);
            break;
    }

    // 回排完的数
    return sorted;
}

// 冒泡排序：相临比，大者后移
// 入参：arr - 待排数组（直改原数组）
void bubbleSort(int[] arr) {
    int n = arr.length;                 // 数长
    for (int i = 0; i < n - 1; i++) {   // 控制趟数
        for (int j = 0; j < n - i - 1; j++) { // 每趟比前n-i-1个
            if (arr[j] > arr[j + 1]) {  // 前>后则交
                int temp = arr[j];
                arr[j] = arr[j + 1];
                arr[j + 1] = temp;
            }
        }
    }
}

// 快速排序：分治法，选基，小左大右
// 入参：arr - 数组；low - 起位；high - 终位
void quickSort(int[] arr, int low, int high) {
    if (low < high) {                   // 至少两元才需排
        int pi = partition(arr, low, high); // 分区得基位
        quickSort(arr, low, pi - 1);    // 排左区
        quickSort(arr, pi + 1, high);   // 排右区
    }
}

// 分区操作：将数组按基分两部
// 入参：arr, low, high
// 出参：基元素最终位
int partition(int[] arr, int low, int high) {
    int pivot = arr[high];              // 取最末为基
    int i = low - 1;                    // 小于区的边界指针

    for (int j = low; j < high; j++) {  // 遍除基外所元
        if (arr[j] <= pivot) {          // 当元≤基
            i++;                        // 扩小分区
            // 交arr[i]与arr[j]
            int temp = arr[i];
            arr[i] = arr[j];
            arr[j] = temp;
        }
    }

    // 交基（arr[high]）与i+1位元
    int temp = arr[i + 1];
    arr[i + 1] = arr[high];
    arr[high] = temp;

    return i + 1;                       // 回基位
}

// 选择排序：每轮选最，放当位
// 入参：arr - 待排数组
void selectionSort(int[] arr) {
    int n = arr.length;
    for (int i = 0; i < n - 1; i++) {   // 控制选位
        int minIdx = i;                 // 假设当元最
        for (int j = i + 1; j < n; j++) { // 遍后所元
            if (arr[j] < arr[minIdx]) { // 找更小的
                minIdx = j;             // 记其索引
            }
        }
        // 交arr[i]与最元
        int temp = arr[minIdx];
        arr[minIdx] = arr[i];
        arr[i] = temp;
    }
}

// 归并排序：分而治之，递归拆合
// 入参：arr - 原数组
// 出参：新排数组
int[] mergeSort(int[] arr) {
    if (arr.length <= 1) {              // 基线：长≤1直回
        return arr;
    }

    int mid = arr.length / 2;           // 找中点
    int[] left = new int[mid];          // 左半
    int[] right = new int[arr.length - mid]; // 右半

    // 拷数到左右子组
    for (int i = 0; i < mid; i++) {
        left[i] = arr[i];
    }
    for (int i = mid; i < arr.length; i++) {
        right[i - mid] = arr[i];
    }

    // 递归排左右
    left = mergeSort(left);
    right = mergeSort(right);

    // 合并两有序子组
    return merge(left, right);
}

// 合并：将两个有序数组合为一个有序数组
// 入参：left, right - 两个有序子数组
// 出参：合并后的有序大数组
int[] merge(int[] left, int[] right) {
    // 新数组长=左长+右长
    int[] result = new int[left.length + right.length];
    int i = 0, j = 0, k = 0;            // 三指针：左、右、结果

    // 同有数时，取小者入结
    while (i < left.length && j < right.length) {
        if (left[i] <= right[j]) {
            result[k++] = left[i++];
        } else {
            result[k++] = right[j++];
        }
    }

    // 处左剩
    while (i < left.length) {
        result[k++] = left[i++];
    }

    // 处右剩
    while (j < right.length) {
        result[k++] = right[j++];
    }

    // 回合完的有数
    return result;
}
```

**排序算法要点：**

  - **冒泡排序**：相邻元素比较交换，简单但效率低
  - **快速排序**：分治思想，选择基准元素分区
  - **选择排序**：每次选择最小元素放到前面
  - **归并排序**：分治思想，合并有序子数组
## 第四步：实现去重功能

```java
// 获取唯一数字（去重）
int[] getUniqueNumbers(int[] numbers) {
    if (numbers.length == 0) return new int[0];

    // 先计算唯一数字的数量
    int uniqueCount = 1;
    for (int i = 1; i < numbers.length; i++) {
        if (numbers[i] != numbers[i - 1]) {
            uniqueCount++;
        }
    }

    // 创建结果数组
    int[] unique = new int[uniqueCount];
    unique[0] = numbers[0];
    int index = 1;

    for (int i = 1; i < numbers.length; i++) {
        if (numbers[i] != numbers[i - 1]) {
            unique[index++] = numbers[i];
        }
    }

    return unique;
}
```

**去重逻辑：**

  - 前提：数组必须已排序
  - 遍历数组，只保留与前一个元素不同的元素
## 第五步：实现单调栈处理

```java
// 用单调栈处数，并打每步
// 入参：numbers - 数列；isChinese - 是否中提
void processWithMonotonicStack(int[] numbers, boolean isChinese) {
    if (numbers.length == 0) return;    // 空则直退

    // 用数组模栈结：stack 数组 + top 指针
    int[] stack = new int[numbers.length]; // 栈存数
    int top = -1;                       // 栈顶指针（-1 = 空）

    // 入栈序：保栈单递增（从底到顶）
    for (int num : numbers) {           // 遍每数
        // 弹所小栈顶：保单性
        while (top >= 0 && stack[top] < num) {
            if (isChinese) {
                System.out.println(stack[top] + " 已出栈！");
            } else {
                System.out.println(stack[top] + " popped!");
            }
            sleep(200);                 // 停0.2秒，造动效
            top--;                      // 出栈：指针减1
        }

        // 当数入栈
        stack[++top] = num;             // 先+1，再赋值
        if (isChinese) {
            System.out.println(num + " 已进栈！");
        } else {
            System.out.println(num + " pushed!");
        }
        sleep(200);                     // 停0.2秒
    }

    // 完提
    if (isChinese) {
        System.out.println("完成！");
        System.out.println("=======================");
    } else {
        System.out.println("Completed!");
        System.out.println("=======================");
    }
}

// 出栈流：模后进先出（LIFO）
// 入参：numbers - 原数组（视为栈中数）
// 出参：出栈顺的新数组
int[] popFromStack(int[] numbers, boolean isChinese) {
    // 栈为LIFO，故出栈序 = 原序逆
    int[] result = new int[numbers.length];
    for (int i = 0; i < numbers.length; i++) {
        // 从尾到头取数
        result[i] = numbers[numbers.length - 1 - i];
        if (isChinese) {
            System.out.println(result[i] + " 已出栈！");
        } else {
            System.out.println(result[i] + " popped!");
        }
        sleep(200);                     // 每出一停0.2秒
    }
    return result;                      // 回出栈序
}
```

**单调栈概念：**

  - 保持栈内元素单调递增或递减
  - 用于解决"下一个更大元素"等问题
  - 这里实现的是递增栈
## 第六步：整合完整的主函数

```java
void main() {
    // 检测系统语言
    String language = System.getProperty("user.language");
    boolean isChinese = "zh".equals(language) || "cn".equals(language);

    // 读取输入
    String input = readInput(isChinese ? "请输入数字: " : "Enter numbers: ");

    // 提取每个单独的数字字符
    int[] numbers = extractSingleDigits(input);

    // 原样输出
    printArray(numbers);
    sleep(300);

    // 随机选择排序算法
    String sortType = selectRandomSort();
    if (isChinese) {
        System.out.println("当前自动选择：" + sortType);
    } else {
        System.out.println("Currently selected: " + sortType);
    }
    sleep(500);

    int[] sorted = sortNumbers(numbers, sortType);
    printArray(sorted);
    sleep(200);

    // 唯一性处理
    if (isChinese) {
        System.out.println("唯一性处理,启动！");
    } else {
        System.out.println("Unique processing, starting!");
    }
    sleep(100);

    int[] unique = getUniqueNumbers(sorted);
    printArray(unique);

    // 单调栈处理
    if (isChinese) {
        System.out.println("进栈！");
    } else {
        System.out.println("Pushing to stack!");
    }

    processWithMonotonicStack(unique, isChinese);

    sleep(500);

    if (isChinese) {
        System.out.println("出栈！");
    } else {
        System.out.println("Popping from stack!");
    }

    // 出栈流程
    int[] stackResult = popFromStack(unique, isChinese);

    if (isChinese) {
        System.out.println("出栈完成！");
        System.out.println("入表！");
    } else {
        System.out.println("Popping completed!");
        System.out.println("Adding to table!");
    }

    printArray(stackResult);

    if (isChinese) {
        System.out.println("工作完成！");
        System.out.println("=======================");
        sleep(500);
        System.out.println("tips:本示范来自blog.meowhead.cn，建议jdk版本24，盗文章死马。");
        System.out.println("微信公众号：绪方小原");
    } else {
        System.out.println("Work completed!");
        System.out.println("=======================");
        sleep(500);
        System.out.println("tips: This demo is from blog.meowhead.cn, recommended JDK version 24.");
        System.out.println("WeChat public account: 绪方小原");
    }
}
```
## 学习建议

  1. **分步调试**：先实现基础功能，再逐步添加复杂功能
  2. **理解算法**：重点理解每种排序算法的原理和优缺点
  3. **代码复用**：学会将常用功能封装成函数
  4. **错误处理**：在实际项目中要添加更多异常处理
## 运行示例

```text
请输入数字: 7744233336899641024
[7,7,4,4,2,3,3,3,3,6,8,9,9,6,4,1,0,2,4]
当前自动选择：快速排序
[0,1,2,2,3,3,3,3,4,4,4,4,6,6,7,7,8,9,9]
唯一性处理,启动！
[0,1,2,3,4,6,7,8,9]
进栈！
0 已进栈！
0 已出栈！
1 已进栈！
1 已出栈！
2 已进栈！
2 已出栈！
3 已进栈！
3 已出栈！
4 已进栈！
4 已出栈！
6 已进栈！
6 已出栈！
7 已进栈！
7 已出栈！
8 已进栈！
8 已出栈！
9 已进栈！
完成！
=======================
出栈！
9 已出栈！
8 已出栈！
7 已出栈！
6 已出栈！
4 已出栈！
3 已出栈！
2 已出栈！
1 已出栈！
0 已出栈！
出栈完成！
入表！
[9,8,7,6,4,3,2,1,0]
工作完成！
=======================
tips:本示范来自blog.meowhead.cn，建议jdk版本24，盗文章死马。
微信公众号：绪方小原
```
