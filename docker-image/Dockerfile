# 1. Use the absolute bare minimum ROS2 base (No GUI, no Gazebo, just core ROS)
FROM ros:humble-ros-core

# 2. Install ttyd (a lightweight tool that streams a terminal over HTTP)
RUN apt-get update && apt-get install -y ttyd && rm -rf /var/lib/apt/lists/*

# 3. Automatically source ROS2 so students can use ROS commands instantly
RUN echo "source /opt/ros/humble/setup.bash" >> ~/.bashrc

# 4. Expose the web port we configured in Kubernetes
EXPOSE 80

# 5. Launch the web terminal on port 80, allowing browser interaction (-W allows writing)
CMD ["ttyd", "-p", "80", "bash"]