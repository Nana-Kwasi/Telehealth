import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { db, auth } from '../../Auth/firebaseConfig';
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { ArrowLeft, Target, Clock } from 'lucide-react';
import './WorksheetView.css';

export default function WorksheetView() {
  const { worksheetId } = useParams();
  const navigate = useNavigate();
  const [worksheet, setWorksheet] = useState(null);
  const [worksheetResponses, setWorksheetResponses] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const currentUser = auth.currentUser;

  useEffect(() => {
    const fetchWorksheet = async () => {
      try {
        const worksheetDoc = await getDoc(doc(db, 'worksheets', worksheetId));
        if (worksheetDoc.exists()) {
          const data = { id: worksheetDoc.id, ...worksheetDoc.data() };
          setWorksheet(data);
          
          const clientId = localStorage.getItem('th.clientId') || currentUser?.uid;
          const clientResponse = data.clientResponses?.[clientId];
          
          if (clientResponse?.responses) {
            const responses = {};
            data.fields?.forEach((field, index) => {
              responses[index] = clientResponse.responses[index] || '';
            });
            setWorksheetResponses(responses);
          }
        }
      } catch (error) {
        console.error('Error fetching worksheet:', error);
      } finally {
        setLoading(false);
      }
    };

    if (worksheetId) {
      fetchWorksheet();
    }
  }, [worksheetId, currentUser]);

  const handleResponseChange = (index, value) => {
    setWorksheetResponses(prev => ({
      ...prev,
      [index]: value
    }));
  };

  const handleSave = async () => {
    if (!worksheet || !currentUser) return;
    
    setSaving(true);
    try {
      const clientId = localStorage.getItem('th.clientId') || currentUser.uid;
      const worksheetRef = doc(db, 'worksheets', worksheetId);
      const worksheetDoc = await getDoc(worksheetRef);
      
      if (worksheetDoc.exists()) {
        const currentData = worksheetDoc.data();
        const clientResponses = currentData.clientResponses || {};
        const existingResponse = clientResponses[clientId] || { responses: {} };
        const hasNewFields = existingResponse.needsToCompleteNewFields === true;
        
        // Merge new responses with existing ones
        const existingResponses = existingResponse.responses || {};
        const mergedResponses = { ...existingResponses, ...worksheetResponses };
        
        // Determine completion status
        const allFieldsAnswered = worksheet.fields.every((_, index) => 
          mergedResponses[index] !== undefined && mergedResponses[index] !== ''
        );
        
        await updateDoc(worksheetRef, {
          [`clientResponses.${clientId}`]: {
            ...existingResponse,
            responses: mergedResponses,
            submittedAt: serverTimestamp(),
            status: allFieldsAnswered ? 'completed' : 'pending',
            needsToCompleteNewFields: false, // Reset this flag after submission
            lastUpdated: serverTimestamp()
          }
        });
        
        alert(hasNewFields ? 'New fields submitted successfully!' : 'Worksheet saved successfully!');
        
        // Refresh the worksheet to show updated status
        const updatedDoc = await getDoc(worksheetRef);
        if (updatedDoc.exists()) {
          const updatedData = { id: updatedDoc.id, ...updatedDoc.data() };
          setWorksheet(updatedData);
          
          const updatedClientResponse = updatedData.clientResponses?.[clientId];
          if (updatedClientResponse?.responses) {
            const responses = {};
            updatedData.fields?.forEach((field, index) => {
              responses[index] = updatedClientResponse.responses[index] || '';
            });
            setWorksheetResponses(responses);
          }
        }
      }
    } catch (error) {
      console.error('Error saving worksheet:', error);
      alert('Failed to save worksheet');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="page-container">
        <div className="loading-state">Loading worksheet...</div>
      </div>
    );
  }

  if (!worksheet) {
    return (
      <div className="page-container">
        <div className="error-state">Worksheet not found</div>
        <button onClick={() => navigate('/dashboard/resources')} className="btn-primary">
          Back to Resources
        </button>
      </div>
    );
  }

  const clientId = localStorage.getItem('th.clientId') || currentUser?.uid;
  const clientResponse = worksheet.clientResponses?.[clientId];
  const hasExistingResponse = clientResponse?.responses;

  return (
    <div className="page-container worksheet-view-page">
      <div className="page-header">
        <button onClick={() => navigate('/dashboard/resources')} className="back-button">
          <ArrowLeft size={20} />
          Back to Resources
        </button>
        <h1 className="page-title">{worksheet.title}</h1>
      </div>

      <div className="worksheet-content">
        <div className="worksheet-header">
          <div className="worksheet-meta">
            <div className="meta-item">
              <Target size={16} />
              <span>Goal: {worksheet.goal}</span>
            </div>
            <div className="meta-item">
              <Clock size={16} />
              <span>{worksheet.fields?.length || 0} questions</span>
            </div>
          </div>
        </div>

        {worksheet.description && (
          <div className="worksheet-section">
            <h3>Instructions</h3>
            <div className="instructions-box">
              <p style={{ whiteSpace: 'pre-wrap' }}>{worksheet.description}</p>
            </div>
          </div>
        )}

        {worksheet.instructions && (
          <div className="worksheet-section">
            <h3>Additional Instructions</h3>
            <div className="instructions-box">
              <p style={{ whiteSpace: 'pre-wrap' }}>{worksheet.instructions}</p>
            </div>
          </div>
        )}

        {worksheet.fields && worksheet.fields.length > 0 && (
          <div className="worksheet-section">
            <h3>Questions</h3>
            <div className="fields-list">
              {worksheet.fields.map((field, index) => {
                const clientId = localStorage.getItem('th.clientId') || currentUser?.uid;
                const clientResponse = worksheet.clientResponses?.[clientId];
                const hasExistingResponse = clientResponse?.responses && clientResponse.responses[index] !== undefined;
                const hasNewFields = clientResponse?.needsToCompleteNewFields === true;
                
                // Field is editable if:
                // 1. No existing response for this field, OR
                // 2. There are new fields and this field is beyond the original field count
                const isEditable = !hasExistingResponse || (hasNewFields && index >= (Object.keys(clientResponse?.responses || {}).length));
                const isNewField = hasNewFields && index >= (Object.keys(clientResponse?.responses || {}).length);
                const existingAnswer = hasExistingResponse ? clientResponse.responses[index] : undefined;
                
                return (
                  <div key={index} className={`field-item ${!isEditable ? 'completed' : ''} ${isNewField ? 'new-field' : ''}`}>
                    <div className="field-header">
                      <h4>{field.name}</h4>
                      {field.required && <span className="required-badge">Required</span>}
                      {!isEditable && hasExistingResponse && <span className="completed-badge">Completed</span>}
                      {isNewField && <span className="new-field-badge">New Field</span>}
                    </div>
                    
                    {!isEditable && hasExistingResponse && (
                      <div className="field-response">
                        <strong>Your Answer:</strong>
                        <div className="response-value">
                          {(() => {
                            const existingAnswer = clientResponse.responses[index];
                            if (existingAnswer !== undefined) {
                              return Array.isArray(existingAnswer) ? existingAnswer.join(', ') : existingAnswer.toString();
                            }
                            return 'No answer provided';
                          })()}
                        </div>
                      </div>
                    )}

                    {clientResponse?.feedback && (
                      <div className="therapist-feedback">
                        <strong>Therapist Feedback:</strong>
                        <div className="feedback-content">
                          <div className="feedback-rating">
                            Rating: {clientResponse.feedback.rating}/10
                          </div>
                          <div className="feedback-text">
                            {clientResponse.feedback.feedback}
                          </div>
                        </div>
                      </div>
                    )}
                    
                    <div className={`field-input ${!isEditable ? 'disabled' : ''}`}>
                      {field.type === 'text' && (
                        <input
                          type="text"
                          value={(() => {
                            if (!isEditable && hasExistingResponse) {
                              const existingAnswer = clientResponse.responses[index];
                              return existingAnswer !== undefined ? existingAnswer.toString() : '';
                            }
                            return worksheetResponses[index] || '';
                          })()}
                          onChange={(e) => handleResponseChange(index, e.target.value)}
                          placeholder="Enter your answer..."
                          disabled={!isEditable}
                        />
                      )}
                      
                      {field.type === 'textarea' && (
                        <textarea
                          value={(() => {
                            if (!isEditable && hasExistingResponse) {
                              const existingAnswer = clientResponse.responses[index];
                              return existingAnswer !== undefined ? existingAnswer.toString() : '';
                            }
                            return worksheetResponses[index] || '';
                          })()}
                          onChange={(e) => handleResponseChange(index, e.target.value)}
                          placeholder="Enter your detailed answer..."
                          rows={4}
                          disabled={!isEditable}
                        />
                      )}
                      
                      {field.type === 'number' && (
                        <input
                          type="number"
                          value={(() => {
                            if (!isEditable && hasExistingResponse) {
                              const existingAnswer = clientResponse.responses[index];
                              return existingAnswer !== undefined ? existingAnswer.toString() : '';
                            }
                            return worksheetResponses[index] || '';
                          })()}
                          onChange={(e) => handleResponseChange(index, e.target.value)}
                          placeholder="Enter a number..."
                          disabled={!isEditable}
                        />
                      )}
                      
                      {field.type === 'date' && (
                        <input
                          type="date"
                          value={(() => {
                            if (!isEditable && hasExistingResponse) {
                              const existingAnswer = clientResponse.responses[index];
                              return existingAnswer !== undefined ? existingAnswer.toString() : '';
                            }
                            return worksheetResponses[index] || '';
                          })()}
                          onChange={(e) => handleResponseChange(index, e.target.value)}
                          disabled={!isEditable}
                        />
                      )}
                      
                      {field.type === 'select' && (
                        <select
                          value={(() => {
                            if (!isEditable && hasExistingResponse) {
                              const existingAnswer = clientResponse.responses[index];
                              return existingAnswer !== undefined ? existingAnswer.toString() : '';
                            }
                            return worksheetResponses[index] || '';
                          })()}
                          onChange={(e) => handleResponseChange(index, e.target.value)}
                          disabled={!isEditable}
                        >
                          <option value="">Select an option...</option>
                          {field.options && Array.isArray(field.options) && field.options.length > 0 ? (
                            field.options.map((option, optIndex) => (
                              <option key={optIndex} value={option}>{option}</option>
                            ))
                          ) : (
                            <option value="" disabled>No options available</option>
                          )}
                        </select>
                      )}
                      
                      {field.type === 'radio' && (
                        <div className="radio-group">
                          {field.options && Array.isArray(field.options) && field.options.length > 0 ? (
                            field.options.map((option, optIndex) => (
                              <label key={optIndex} className="radio-option">
                                <input
                                  type="radio"
                                  name={`field_${index}`}
                                  value={option}
                                  checked={(() => {
                                    if (!isEditable && hasExistingResponse) {
                                      const existingAnswer = clientResponse.responses[index];
                                      return existingAnswer === option;
                                    }
                                    return worksheetResponses[index] === option;
                                  })()}
                                  onChange={(e) => handleResponseChange(index, e.target.value)}
                                  disabled={!isEditable}
                                />
                                <span>{option}</span>
                              </label>
                            ))
                          ) : (
                            <p className="no-options">No options available</p>
                          )}
                        </div>
                      )}
                      
                      {field.type === 'checkbox' && (
                        <label className="checkbox-option">
                          <input
                            type="checkbox"
                            checked={(() => {
                              if (!isEditable && hasExistingResponse) {
                                const existingAnswer = clientResponse.responses[index];
                                return existingAnswer === true;
                              }
                              return worksheetResponses[index] || false;
                            })()}
                            onChange={(e) => handleResponseChange(index, e.target.checked)}
                            disabled={!isEditable}
                          />
                          <span>I agree</span>
                        </label>
                      )}
                      
                      {field.type === 'rating' && (
                        <div className="rating-group">
                          <div className="rating-scale">
                            <span>1</span>
                            {[1,2,3,4,5,6,7,8,9,10].map(num => (
                              <label key={num} className="rating-option">
                                <input
                                  type="radio"
                                  name={`rating_${index}`}
                                  value={num}
                                  checked={(() => {
                                    if (!isEditable && hasExistingResponse) {
                                      const existingAnswer = clientResponse.responses[index];
                                      return existingAnswer === num;
                                    }
                                    return worksheetResponses[index] === num;
                                  })()}
                                  onChange={(e) => handleResponseChange(index, parseInt(e.target.value))}
                                  disabled={!isEditable}
                                />
                                <span className="rating-dot">{num}</span>
                              </label>
                            ))}
                            <span>10</span>
                          </div>
                        </div>
                      )}
                      
                      {field.type === 'multiple-choice' && (
                        <div className="multiple-choice-group">
                          {field.options && Array.isArray(field.options) && field.options.length > 0 ? (
                            field.options.map((option, optIndex) => (
                              <label key={optIndex} className="checkbox-option">
                                <input
                                  type="checkbox"
                                  checked={(() => {
                                    const currentValues = (!isEditable && hasExistingResponse) 
                                      ? (clientResponse.responses[index] || [])
                                      : (worksheetResponses[index] || []);
                                    return Array.isArray(currentValues) && currentValues.includes(option);
                                  })()}
                                  onChange={(e) => {
                                    const currentValues = (!isEditable && hasExistingResponse)
                                      ? (clientResponse.responses[index] || [])
                                      : (worksheetResponses[index] || []);
                                    const newValues = e.target.checked
                                      ? [...(Array.isArray(currentValues) ? currentValues : []), option]
                                      : (Array.isArray(currentValues) ? currentValues.filter(v => v !== option) : []);
                                    handleResponseChange(index, newValues);
                                  }}
                                  disabled={!isEditable}
                                />
                                <span>{option}</span>
                              </label>
                            ))
                          ) : (
                            <p className="no-options">No options available</p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {(() => {
          const clientId = localStorage.getItem('th.clientId') || currentUser?.uid;
          const clientResponse = worksheet.clientResponses?.[clientId];
          const hasNewFields = clientResponse?.needsToCompleteNewFields === true;
          const hasExistingResponse = clientResponse?.responses && Object.keys(clientResponse.responses).length > 0;
          const hasResponses = Object.keys(worksheetResponses).length > 0;
          
          // Show save button if there are responses AND (no existing response OR new fields to complete)
          if (hasResponses && (!hasExistingResponse || hasNewFields)) {
            return (
              <div className="worksheet-actions">
                <button 
                  onClick={handleSave}
                  disabled={saving}
                  className="btn-primary"
                >
                  {saving ? 'Saving...' : hasNewFields ? 'Submit New Fields' : 'Save Worksheet'}
                </button>
              </div>
            );
          }
          return null;
        })()}
      </div>
    </div>
  );
}
