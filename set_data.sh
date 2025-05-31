#!/bin/bash

# 创建主数据目录
data_dir="server/data"
mkdir -p $data_dir

# 创建所有子目录
mkdir -p $data_dir/orders
mkdir -p $data_dir/products
mkdir -p $data_dir/messages
mkdir -p $data_dir/users
mkdir -p $data_dir/uploads
mkdir -p $data_dir/evaluations

# 第二层
mkdir -p $data_dir/messages/images
mkdir -p $data_dir/messages/voices
mkdir -p $data_dir/uploads/avatars
mkdir -p $data_dir/uploads/products

echo "数据目录结构创建完成"
