import { useState } from 'react';

export default function App() {
  const [labState, setLabState] = useState<'IDLE' | 'PROVISIONING' | 'RUNNING'>('IDLE');
  const [labUrl, setLabUrl] = useState<string>('');
  // ADD THIS LINE: A simple counter to trigger iframe reloads
  const [terminalKey, setTerminalKey] = useState<number>(0);
  // Hardcoded for testing. Later, this comes from your actual login page!
  const [token, setToken] = useState<string>('');
  const studentId = 'yash-001'; 

  const handleStartLab = async () => {
    setLabState('PROVISIONING');

    try {
      // 1. Mock Login: Get the unforgeable JWT ID card
      const loginRes = await fetch('https://interdentally-moderne-taunya.ngrok-free.dev/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId })
      });
      const { access_token } = await loginRes.json();
      setToken(access_token); 
      // 2. Launch Infrastructure: Pass the JWT in the Authorization header
      const launchRes = await fetch('https://interdentally-moderne-taunya.ngrok-free.dev/api/labs/launch', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${access_token}`
        }
      });
      
      const launchData = await launchRes.json();

      if (launchRes.ok) {
        // Success! Save the path and update the UI
        setLabUrl(launchData.internalPath);
        setLabState('RUNNING');
      } else {
        alert('Failed to launch: ' + launchData.message);
        setLabState('IDLE');
      }
    } catch (error) {
      console.error(error);
      alert('Network error connecting to backend.');
      setLabState('IDLE');
    }
  };
  const handleStopLab = async () => {
    // 1. We need the token again to prove we have permission to destroy the lab
    // In a real app, you would save this token in localStorage or a Context provider
    const loginRes = await fetch('https://interdentally-moderne-taunya.ngrok-free.dev/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId })
    });
    const { access_token } = await loginRes.json();

    try {
      // 2. Fire the DELETE request to your NestJS backend
      const stopRes = await fetch(`https://interdentally-moderne-taunya.ngrok-free.dev/api/labs/stop`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${access_token}`
        }
      });

      if (stopRes.ok) {
        // 3. Reset the UI back to the beginning
        setLabUrl('');
        setLabState('IDLE');
        alert('Hardware successfully destroyed.');
      } else {
        const errorData = await stopRes.json();
        alert('Failed to stop: ' + errorData.message);
      }
    } catch (error) {
      console.error(error);
      alert('Network error connecting to backend.');
    }
  };
  return (
    <div style={{ padding: '40px', fontFamily: 'sans-serif', maxWidth: '600px', margin: '0 auto' }}>
      <h1>ROS2 Cloud Labs</h1>
      <p>Welcome, {studentId}. Click below to provision your dedicated hardware.</p>

      {labState === 'IDLE' && (
        <button 
          onClick={handleStartLab}
          style={{ padding: '15px 30px', fontSize: '18px', backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer' }}
        >
           Start ROS2 Environment
        </button>
      )}

      {labState === 'PROVISIONING' && (
        <div style={{ padding: '20px', backgroundColor: '#f3f4f6', borderRadius: '8px' }}>
          <h3> Provisioning Secure Sandbox...</h3>
          <p>Allocating CPU, RAM, and internal network routes. This takes about 15 seconds.</p>
        </div>
      )}

      {labState === 'RUNNING' && (
        <div style={{ padding: '20px', backgroundColor: '#d1fae5', borderRadius: '8px', border: '1px solid #10b981' }}>
          <h3 style={{ color: '#047857' }}>✅ Lab is Live!</h3>
          <p>Your isolated Kubernetes Pod is active.</p>
          
          {/* NEW: Flexbox container to put the URL and Refresh button side-by-side */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '15px' }}>
            <p style={{ margin: 0 }}><strong>Path:</strong> {labUrl}</p>
            
            <button 
              onClick={() => setTerminalKey(prev => prev + 1)}
              style={{ padding: '6px 12px', backgroundColor: '#3b82f6', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '14px' }}
            >
              🔄 Refresh Terminal
            </button>
          </div>
          
          {/* THE MAGIC WINDOW */}
          <iframe 
            key={terminalKey} // <-- ADD THIS LINE: React will remount the iframe when this changes
            src={`k8s-ros2mastergateway-6e2fe3d7f8-1865910229.ap-northeast-1.elb.amazonaws.com${labUrl}/?access_token=${token}`} 
            width="100%" 
            height="600px" 
            style={{ border: '2px solid #10b981', borderRadius: '8px', marginTop: '10px', backgroundColor: '#fff' }}
            title="ROS2 Workspace"
          />

          <button 
            style={{ padding: '10px 20px', marginTop: '15px', backgroundColor: '#ef4444', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', display: 'block', width: '100%' }}
            onClick={handleStopLab}
          >
            ⏹️ End Lab (Destroy Hardware)
          </button>
        </div>
      )}
    </div>
  );
}