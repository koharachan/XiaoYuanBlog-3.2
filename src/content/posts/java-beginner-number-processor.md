---
title: "用 Java 写一个数字处理小程序"
published: 2025-10-07
updated: 2025-10-07
draft: false
description: "用 Java 从一行文本中提取 0–9 数字、排序去重，再演示一个真正的栈操作；附传统 public class 写法、运行命令和可继续扩展的方向。"
image: ""
tags: ["教程", "Java", "入门", "排序", "数据结构"]
category: 外版
comment: true
---

这篇从一个小程序开始练习 Java 的输入、数组、排序、去重和栈。程序只提取输入中的单个数字字符 `0`–`9`；它不会把 `123` 当成一个整数，而是得到 `1、2、3` 三个数字。这个限制是为了把重点放在基础数据结构上。

## 运行环境

下面使用传统的 `public class Main` 和 `public static void main` 写法，JDK 17 及以上都可以编译运行：

```bash
javac Main.java
java Main
```

原稿使用过隐式类和实例 `main` 的新语法。那套写法对 JDK 版本和预览开关有要求，不适合把“入门教程”作为唯一示例，所以这里改成更容易迁移的形式。

## 第一步：读取并提取数字

```java
import java.util.ArrayList;
import java.util.List;
import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        Scanner scanner = new Scanner(System.in);
        System.out.print("请输入一行文本：");
        String input = scanner.nextLine();

        List<Integer> numbers = new ArrayList<>();
        for (char ch : input.toCharArray()) {
            if (ch >= '0' && ch <= '9') {
                numbers.add(ch - '0');
            }
        }

        if (numbers.isEmpty()) {
            System.out.println("没有找到数字字符。");
            return;
        }

        int[] values = numbers.stream().mapToInt(Integer::intValue).toArray();
        System.out.println("提取结果：" + format(values));

        bubbleSort(values);
        System.out.println("排序结果：" + format(values));

        int[] unique = deduplicate(values);
        System.out.println("去重结果：" + format(unique));

        stackDemo(unique);
    }

    private static String format(int[] values) {
        StringBuilder result = new StringBuilder();
        for (int i = 0; i < values.length; i++) {
            if (i > 0) result.append(", ");
            result.append(values[i]);
        }
        return result.toString();
    }
```

`ch - '0'` 利用字符编码的连续性，把字符 `'7'` 转成整数 `7`。如果输入中没有数字，程序直接结束，不会对空数组排序。

## 第二步：实现冒泡排序

```java
    private static void bubbleSort(int[] values) {
        for (int end = values.length - 1; end > 0; end--) {
            boolean swapped = false;
            for (int i = 0; i < end; i++) {
                if (values[i] > values[i + 1]) {
                    int temp = values[i];
                    values[i] = values[i + 1];
                    values[i + 1] = temp;
                    swapped = true;
                }
            }
            if (!swapped) break;
        }
    }
```

每一轮把当前最大的元素推到右侧。最坏时间复杂度是 `O(n²)`，数据已经有序时，因为 `swapped` 标记可以提前结束。真实项目通常直接使用 `Arrays.sort`，手写排序适合练习算法过程。

## 第三步：去重

排序后，相同数字会相邻，因此只需要保留与前一个元素不同的值：

```java
    private static int[] deduplicate(int[] sorted) {
        int count = 1;
        for (int i = 1; i < sorted.length; i++) {
            if (sorted[i] != sorted[i - 1]) count++;
        }

        int[] result = new int[count];
        result[0] = sorted[0];
        int index = 1;
        for (int i = 1; i < sorted.length; i++) {
            if (sorted[i] != sorted[i - 1]) {
                result[index++] = sorted[i];
            }
        }
        return result;
    }
```

这个实现假设输入数组非空，调用前已经完成了空数组检查。

## 第四步：演示真正的栈操作

原稿把“排序后的数组倒序输出”称为单调栈，但那并没有体现单调栈的用途。这里改成一个更诚实的栈演示：把去重后的数字依次入栈，再从栈顶弹出，因此输出顺序与入栈顺序相反。

```java
    private static void stackDemo(int[] values) {
        int[] stack = new int[values.length];
        int top = 0;

        for (int value : values) {
            stack[top++] = value;
            System.out.println(value + " 入栈");
        }

        System.out.print("出栈顺序：");
        while (top > 0) {
            if (top < values.length) System.out.print(", ");
            System.out.print(stack[--top]);
        }
        System.out.println();
    }
}
```

例如输入：

```text
房间里有 3 只猫，编号是 1、3、3、8
```

输出会类似于：

```text
提取结果：3, 1, 3, 3, 8
排序结果：1, 3, 3, 3, 8
去重结果：1, 3, 8
1 入栈
3 入栈
8 入栈
出栈顺序：8, 3, 1
```

## 可以继续改进什么

- 如果需要支持 `123` 这样的多位数，应改成按空白或分隔符解析整数，而不是逐字符提取。
- 可以用 `Arrays.sort` 和手写冒泡排序跑同一组数据，比较代码复杂度和耗时。
- 如果要学习单调栈，可以做“下一个更大元素”问题，而不是对已经排序的数组反转。
- 可以为“空输入、没有数字、重复数字、负数和多位数”补上测试用例。
