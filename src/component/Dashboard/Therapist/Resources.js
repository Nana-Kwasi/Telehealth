import React, { useState, useEffect } from 'react';
import { 
  BookOpen, 
  FileText, 
  Users, 
  AlertTriangle, 
  ClipboardList, 
  GraduationCap, 
  Video, 
  Download, 
  Upload, 
  Search, 
  Filter, 
  Plus, 
  Edit, 
  Trash2, 
  Eye,
  Star,
  Clock,
  Tag,
  Play,
  File,
  Image,
  Link,
  Settings,
  Shield,
  DollarSign,
  Award,
  Target,
  Heart,
  Brain,
  Zap
} from 'lucide-react';
import jsPDF from 'jspdf';
import { auth, db } from '../../Auth/firebaseConfig';
import { 
  collection, 
  query, 
  where, 
  orderBy, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  getDocs,
  serverTimestamp 
} from 'firebase/firestore';
import './Resources.css';

export default function TherapistResources() {
  const [activeTab, setActiveTab] = useState('homework');
  const [resources, setResources] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedResource, setSelectedResource] = useState(null);
  const [showClientSelection, setShowClientSelection] = useState(false);
  const [allClients, setAllClients] = useState([]);
  const [assignedClients, setAssignedClients] = useState([]);
  const [selectedClients, setSelectedClients] = useState([]);
  const [allTherapists, setAllTherapists] = useState([]);
  const [selectedTherapists, setSelectedTherapists] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);
  const [filePreview, setFilePreview] = useState('');
  const [therapistNames, setTherapistNames] = useState({});
  const [showWorksheetModal, setShowWorksheetModal] = useState(false);
  const [worksheetForm, setWorksheetForm] = useState({
    title: '',
    description: '',
    goal: '',
    instructions: '',
    category: 'CBT',
    type: 'patient-facing',
    status: 'active',
    fields: [],
    allowMultipleResponses: true,
    assignedTo: []
  });
  const [resourceForm, setResourceForm] = useState({
    title: '',
    description: '',
    category: 'homework',
    type: 'document',
    content: '',
    tags: [],
    difficulty: 'beginner',
    duration: '',
    targetAudience: 'all',
    isPublic: true,
    fileUrl: '',
    fileName: '',
    fileSize: '',
    linkUrl: '',
    selectedClients: [],
    // Category-specific fields
    exercises: '',
    instructions: '',
    completionTime: '',
    materialsNeeded: '',
    learningObjectives: '',
    keyConcepts: '',
    additionalReading: '',
    discussionQuestions: '',
    resourceType: '',
    location: '',
    contactInfo: '',
    availability: '',
    eligibility: '',
    cost: '',
    crisisType: '',
    urgencyLevel: '',
    safetyPlan: '',
    followUpSteps: '',
    warningSigns: '',
    assessmentType: '',
    scoringMethod: '',
    interpretation: '',
    validityInfo: '',
    ageRange: '',
    protocolType: '',
    evidenceBase: '',
    sessionCount: '',
    outcomeMeasures: '',
    contraindications: '',
    researchType: '',
    authors: '',
    publicationDate: '',
    journal: '',
    doi: '',
    abstract: '',
    keyFindings: '',
    trainingLevel: '',
    certification: '',
    prerequisites: '',
    learningOutcomes: '',
    ceuCredits: '',
    videoLength: '',
    instructor: '',
    topics: '',
    skillLevel: '',
    certificate: '',
    guidelineType: '',
    organization: '',
    lastUpdated: '',
    complianceLevel: '',
    implementation: '',
    monitoring: '',
    legalType: '',
    jurisdiction: '',
    effectiveDate: '',
    complianceRequirements: '',
    penalties: '',
    resources: ''
  });

  const currentUser = auth.currentUser;

  // Resource categories and types
  const categories = {
    homework: {
      name: 'Homework & Exercises',
      icon: BookOpen,
      color: 'blue',
      description: 'Client homework assignments and therapeutic exercises',
      fields: ['title', 'description', 'type', 'difficulty', 'duration', 'targetAudience', 'content', 'tags', 'exercises', 'instructions', 'completionTime', 'materialsNeeded']
    },
    psychoeducation: {
      name: 'Psychoeducational Materials',
      icon: Brain,
      color: 'green',
      description: 'Educational content for client understanding',
      fields: ['title', 'description', 'type', 'difficulty', 'duration', 'targetAudience', 'content', 'tags', 'learningObjectives', 'keyConcepts', 'additionalReading', 'discussionQuestions']
    },
    community: {
      name: 'Community Resources',
      icon: Users,
      color: 'purple',
      description: 'Local and online community support resources',
      fields: ['title', 'description', 'type', 'targetAudience', 'content', 'tags', 'resourceType', 'location', 'contactInfo', 'availability', 'eligibility', 'cost']
    },
    crisis: {
      name: 'Crisis Intervention',
      icon: AlertTriangle,
      color: 'red',
      description: 'Emergency protocols and crisis management tools',
      fields: ['title', 'description', 'type', 'targetAudience', 'content', 'tags', 'crisisType', 'urgencyLevel', 'contactInfo', 'safetyPlan', 'followUpSteps', 'warningSigns']
    },
    assessments: {
      name: 'Assessment Instruments',
      icon: ClipboardList,
      color: 'orange',
      description: 'Clinical assessment tools and questionnaires',
      fields: ['title', 'description', 'type', 'difficulty', 'duration', 'targetAudience', 'content', 'tags', 'assessmentType', 'scoringMethod', 'interpretation', 'validityInfo', 'ageRange']
    },
    protocols: {
      name: 'Treatment Protocols',
      icon: Target,
      color: 'indigo',
      description: 'Evidence-based treatment guidelines',
      fields: ['title', 'description', 'type', 'difficulty', 'duration', 'targetAudience', 'content', 'tags', 'protocolType', 'evidenceBase', 'sessionCount', 'outcomeMeasures', 'contraindications']
    },
    research: {
      name: 'Research & References',
      icon: FileText,
      color: 'gray',
      description: 'Clinical research and reference materials',
      fields: ['title', 'description', 'type', 'targetAudience', 'content', 'tags', 'researchType', 'authors', 'publicationDate', 'journal', 'doi', 'abstract', 'keyFindings']
    },
    education: {
      name: 'Continuing Education',
      icon: GraduationCap,
      color: 'pink',
      description: 'Professional development and training materials',
      fields: ['title', 'description', 'type', 'difficulty', 'duration', 'targetAudience', 'content', 'tags', 'trainingLevel', 'certification', 'prerequisites', 'learningOutcomes', 'ceuCredits']
    },
    videos: {
      name: 'Training Videos',
      icon: Video,
      color: 'teal',
      description: 'Video tutorials and training content',
      fields: ['title', 'description', 'type', 'difficulty', 'duration', 'targetAudience', 'content', 'tags', 'videoLength', 'instructor', 'topics', 'skillLevel', 'certificate']
    },
    guidelines: {
      name: 'Best Practice Guidelines',
      icon: Award,
      color: 'emerald',
      description: 'Professional standards and best practices',
      fields: ['title', 'description', 'type', 'targetAudience', 'content', 'tags', 'guidelineType', 'organization', 'lastUpdated', 'complianceLevel', 'implementation', 'monitoring']
    },
    legal: {
      name: 'Legal & Ethical Guidelines',
      icon: Shield,
      color: 'slate',
      description: 'Legal compliance and ethical standards',
      fields: ['title', 'description', 'type', 'targetAudience', 'content', 'tags', 'legalType', 'jurisdiction', 'effectiveDate', 'complianceRequirements', 'penalties', 'resources']
    }
  };

  const resourceTypes = {
    document: { name: 'Document', icon: FileText },
    video: { name: 'Video', icon: Video },
    link: { name: 'Link', icon: Link },
    image: { name: 'Image', icon: Image },
    audio: { name: 'Audio', icon: Play }
  };

  const difficultyLevels = {
    beginner: 'Beginner',
    intermediate: 'Intermediate',
    advanced: 'Advanced'
  };

  const targetAudiences = {
    all: 'All Clients',
    individuals: 'Individuals',
    teen: 'Teen',
    couples: 'Couples',
    specific: 'Specific Clients'
  };

  const targetAudienceTypes = {
    clients: 'Clients',
    therapists: 'Therapists'
  };

  const therapistAudienceOptions = {
    all: 'All Therapists',
    specific: 'Specific Therapists'
  };

  const worksheetCategories = {
    'CBT': 'Cognitive Behavioral Therapy',
    'DBT': 'Dialectical Behavior Therapy',
    'journaling': 'Journaling',
    'moodTracking': 'Mood Tracking',
    'mindfulness': 'Mindfulness',
    'anxiety': 'Anxiety Management',
    'depression': 'Depression Management',
    'trauma': 'Trauma Recovery',
    'relationships': 'Relationships',
    'selfCare': 'Self Care',
    'other': 'Other'
  };

  const worksheetTypes = {
    'patient-facing': 'Patient-Facing',
  };

  const worksheetStatuses = {
    'active': 'Active',
    'archived': 'Archived'
  };

  // Fetch all resources (visible to all therapists)
  useEffect(() => {
    if (!currentUser) return;

    const resourcesQuery = query(
      collection(db, 'therapistResources'),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(resourcesQuery, async (snap) => {
      const resourcesData = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setResources(resourcesData);
      
      // Fetch therapist names for all unique therapist IDs
      const uniqueTherapistIds = [...new Set(resourcesData.map(resource => resource.therapistId))];
      await fetchTherapistNames(uniqueTherapistIds);
    });

    return unsubscribe;
  }, [currentUser]);

  // Fetch therapist names by IDs
  const fetchTherapistNames = async (therapistIds) => {
    try {
      const therapistPromises = therapistIds.map(async (therapistId) => {
        if (therapistNames[therapistId]) return; // Already cached
        
        const therapistQuery = query(
          collection(db, 'therapists'),
          where('__name__', '==', therapistId)
        );
        const therapistSnap = await getDocs(therapistQuery);
        
        if (!therapistSnap.empty) {
          const therapistData = therapistSnap.docs[0].data();
          return {
            id: therapistId,
            name: therapistData.displayName || therapistData.name || 'Unknown Therapist'
          };
        }
        return { id: therapistId, name: 'Unknown Therapist' };
      });
      
      const therapistData = await Promise.all(therapistPromises);
      const namesMap = {};
      therapistData.forEach(therapist => {
        if (therapist) {
          namesMap[therapist.id] = therapist.name;
        }
      });
      
      setTherapistNames(prev => ({ ...prev, ...namesMap }));
    } catch (error) {
      console.error('Error fetching therapist names:', error);
    }
  };

  // Fetch all clients and therapists for selection
  useEffect(() => {
    if (!currentUser) return;

    const fetchClients = async () => {
      try {
        // Get assigned client IDs from therapist's subcollection (same as Home component)
        const therapistClientsCol = collection(db, 'therapists', currentUser.uid, 'clients');
        const therapistClientsSnap = await getDocs(therapistClientsCol);
        const assignedClientIds = therapistClientsSnap.docs.map(doc => doc.data().clientId);
        
        console.log('🔍 Resources - Assigned client IDs:', assignedClientIds);
        
        // Get all clients from main collection
        const allClientsSnap = await getDocs(collection(db, 'clients'));
        const allClientsData = allClientsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        // Filter assigned clients
        const assignedClientsData = allClientsData.filter(client => assignedClientIds.includes(client.id));
        const otherClientsData = allClientsData.filter(client => !assignedClientIds.includes(client.id));
        
        console.log('🔍 Resources - Assigned clients:', assignedClientsData);
        console.log('🔍 Resources - Other clients:', otherClientsData);
        
        setAssignedClients(assignedClientsData);
        setAllClients(otherClientsData);
      } catch (error) {
        console.error('Error fetching clients:', error);
      }
    };

    // Fetch all therapists
    const allTherapistsQuery = query(collection(db, 'therapists'));
    const allTherapistsUnsub = onSnapshot(allTherapistsQuery, (snapshot) => {
      const allTherapistsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        isAssigned: false
      }));
      setAllTherapists(allTherapistsData);
    });

    fetchClients();

    return () => {
      allTherapistsUnsub();
    };
  }, [currentUser]);

  // Handle file upload
  const handleFileUpload = async (file) => {
    try {
      // In a real implementation, you would upload to Firebase Storage
      // For now, we'll store the file info
      const fileInfo = {
        name: file.name,
        size: file.size,
        type: file.type,
        url: URL.createObjectURL(file) // Temporary URL for preview
      };
      
      setSelectedFile(file);
      setFilePreview(fileInfo.url);
      setResourceForm(prev => ({
        ...prev,
        fileName: fileInfo.name,
        fileSize: fileInfo.size,
        fileUrl: fileInfo.url
      }));
    } catch (error) {
      console.error('Error handling file:', error);
      alert('Error processing file. Please try again.');
    }
  };

  const handleCreateResource = async () => {
    try {
      // Get only the relevant fields for the selected category
      const categoryFields = categories[resourceForm.category]?.fields || [];
      const relevantFields = {};
      
      // Add basic fields that are always included
      const basicFields = ['title', 'description', 'category', 'type', 'content', 'tags', 'difficulty', 'duration', 'targetAudience', 'isPublic'];
      
      // Add basic fields
      basicFields.forEach(field => {
        if (resourceForm[field] !== undefined) {
          relevantFields[field] = resourceForm[field];
        }
      });
      
      // Add category-specific fields
      categoryFields.forEach(field => {
        if (resourceForm[field] !== undefined && resourceForm[field] !== '') {
          relevantFields[field] = resourceForm[field];
        }
      });
      
      // Add type-specific fields
      if (resourceForm.type === 'video' || resourceForm.type === 'audio' || resourceForm.type === 'image') {
        if (selectedFile) {
          relevantFields.fileUrl = filePreview;
          relevantFields.fileName = selectedFile.name;
          relevantFields.fileSize = selectedFile.size;
          relevantFields.fileType = selectedFile.type;
        }
      } else if (resourceForm.type === 'link') {
        if (resourceForm.linkUrl) {
          relevantFields.linkUrl = resourceForm.linkUrl;
        }
      }

      const resourceData = {
        ...relevantFields,
        therapistId: currentUser.uid,
        therapistName: currentUser.displayName || 'Therapist',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        downloads: 0,
        rating: 0,
        reviews: []
      };

      // Handle different resource types
      if (resourceForm.type === 'video' || resourceForm.type === 'audio' || resourceForm.type === 'image') {
        if (!selectedFile) {
          alert('Please select a file for this resource type.');
          return;
        }
        // In production, upload to Firebase Storage and get download URL
        resourceData.fileUrl = filePreview;
        resourceData.fileName = selectedFile.name;
        resourceData.fileSize = selectedFile.size;
        resourceData.fileType = selectedFile.type;
      } else if (resourceForm.type === 'link') {
        if (!resourceForm.linkUrl) {
          alert('Please enter a URL for this link resource.');
          return;
        }
        resourceData.linkUrl = resourceForm.linkUrl;
      }

      await addDoc(collection(db, 'therapistResources'), resourceData);
      setShowCreateModal(false);
      resetForm();
    } catch (error) {
      console.error('Error creating resource:', error);
      alert('Error creating resource. Please try again.');
    }
  };

  const handleUpdateResource = async () => {
    try {
      const resourceData = {
        ...resourceForm,
        updatedAt: serverTimestamp()
      };

      await updateDoc(doc(db, 'therapistResources', selectedResource.id), resourceData);
      setShowEditModal(false);
      setSelectedResource(null);
      resetForm();
    } catch (error) {
      console.error('Error updating resource:', error);
      alert('Error updating resource. Please try again.');
    }
  };

  const handleDeleteResource = async (resourceId) => {
    if (window.confirm('Are you sure you want to delete this resource?')) {
      try {
        await deleteDoc(doc(db, 'therapistResources', resourceId));
      } catch (error) {
        console.error('Error deleting resource:', error);
        alert('Error deleting resource. Please try again.');
      }
    }
  };

  const resetForm = () => {
    setResourceForm({
      title: '',
      description: '',
      category: 'homework',
      type: 'document',
      content: '',
      tags: [],
      difficulty: 'beginner',
      duration: '',
      targetAudience: 'all',
      isPublic: true,
      fileUrl: '',
      fileName: '',
      fileSize: '',
      linkUrl: '',
      selectedClients: [],
      // Category-specific fields
      exercises: '',
      instructions: '',
      completionTime: '',
      materialsNeeded: '',
      learningObjectives: '',
      keyConcepts: '',
      additionalReading: '',
      discussionQuestions: '',
      resourceType: '',
      location: '',
      contactInfo: '',
      availability: '',
      eligibility: '',
      cost: '',
      crisisType: '',
      urgencyLevel: '',
      safetyPlan: '',
      followUpSteps: '',
      warningSigns: '',
      assessmentType: '',
      scoringMethod: '',
      interpretation: '',
      validityInfo: '',
      ageRange: '',
      protocolType: '',
      evidenceBase: '',
      sessionCount: '',
      outcomeMeasures: '',
      contraindications: '',
      researchType: '',
      authors: '',
      publicationDate: '',
      journal: '',
      doi: '',
      abstract: '',
      keyFindings: '',
      trainingLevel: '',
      certification: '',
      prerequisites: '',
      learningOutcomes: '',
      ceuCredits: '',
      videoLength: '',
      instructor: '',
      topics: '',
      skillLevel: '',
      certificate: '',
      guidelineType: '',
      organization: '',
      lastUpdated: '',
      complianceLevel: '',
      implementation: '',
      monitoring: '',
      legalType: '',
      jurisdiction: '',
      effectiveDate: '',
      complianceRequirements: '',
      penalties: '',
      resources: ''
    });
    setSelectedFile(null);
    setFilePreview('');
    setSelectedClients([]);
  };

  const openEditModal = (resource) => {
    setSelectedResource(resource);
    setResourceForm({
      title: resource.title || '',
      description: resource.description || '',
      category: resource.category || 'homework',
      type: resource.type || 'document',
      content: resource.content || '',
      tags: resource.tags || [],
      difficulty: resource.difficulty || 'beginner',
      duration: resource.duration || '',
      targetAudience: resource.targetAudience || 'all',
      isPublic: resource.isPublic !== false,
      fileUrl: resource.fileUrl || '',
      fileName: resource.fileName || '',
      fileSize: resource.fileSize || '',
      linkUrl: resource.linkUrl || '',
      selectedClients: resource.selectedClients || []
    });
    setShowEditModal(true);
  };

  // Client selection functions
  const handleClientSelection = (clientId) => {
    setSelectedClients(prev => {
      if (prev.includes(clientId)) {
        return prev.filter(id => id !== clientId);
      } else {
        return [...prev, clientId];
      }
    });
  };

  // Therapist selection functions
  const handleTherapistSelection = (therapistId) => {
    setSelectedTherapists(prev => {
      if (prev.some(t => t.id === therapistId)) {
        return prev.filter(t => t.id !== therapistId);
      } else {
        const therapist = allTherapists.find(t => t.id === therapistId);
        return therapist ? [...prev, therapist] : prev;
      }
    });
  };

  const handleSaveClientSelection = () => {
    if (resourceForm.targetAudienceType === 'therapists') {
      setResourceForm(prev => ({
        ...prev,
        selectedTherapists: selectedTherapists
      }));
    } else {
    setResourceForm(prev => ({
      ...prev,
      selectedClients: selectedClients
    }));
    }
    setShowClientSelection(false);
  };

  // Function to render category-specific fields
  const renderCategoryFields = () => {
    const category = categories[resourceForm.category];
    if (!category || !category.fields) return null;

    const fieldLabels = {
      exercises: 'Exercises & Activities',
      instructions: 'Instructions',
      completionTime: 'Completion Time',
      materialsNeeded: 'Materials Needed',
      learningObjectives: 'Learning Objectives',
      keyConcepts: 'Key Concepts',
      additionalReading: 'Additional Reading',
      discussionQuestions: 'Discussion Questions',
      resourceType: 'Resource Type',
      location: 'Location',
      contactInfo: 'Contact Information',
      availability: 'Availability',
      eligibility: 'Eligibility Requirements',
      cost: 'Cost',
      crisisType: 'Crisis Type',
      urgencyLevel: 'Urgency Level',
      safetyPlan: 'Safety Plan',
      followUpSteps: 'Follow-up Steps',
      warningSigns: 'Warning Signs',
      assessmentType: 'Assessment Type',
      scoringMethod: 'Scoring Method',
      interpretation: 'Interpretation Guidelines',
      validityInfo: 'Validity Information',
      ageRange: 'Age Range',
      protocolType: 'Protocol Type',
      evidenceBase: 'Evidence Base',
      sessionCount: 'Number of Sessions',
      outcomeMeasures: 'Outcome Measures',
      contraindications: 'Contraindications',
      researchType: 'Research Type',
      authors: 'Authors',
      publicationDate: 'Publication Date',
      journal: 'Journal/Publication',
      doi: 'DOI',
      abstract: 'Abstract',
      keyFindings: 'Key Findings',
      trainingLevel: 'Training Level',
      certification: 'Certification',
      prerequisites: 'Prerequisites',
      learningOutcomes: 'Learning Outcomes',
      ceuCredits: 'CEU Credits',
      videoLength: 'Video Length',
      instructor: 'Instructor',
      topics: 'Topics Covered',
      skillLevel: 'Skill Level',
      certificate: 'Certificate Available',
      guidelineType: 'Guideline Type',
      organization: 'Organization',
      lastUpdated: 'Last Updated',
      complianceLevel: 'Compliance Level',
      implementation: 'Implementation Steps',
      monitoring: 'Monitoring Requirements',
      legalType: 'Legal Type',
      jurisdiction: 'Jurisdiction',
      effectiveDate: 'Effective Date',
      complianceRequirements: 'Compliance Requirements',
      penalties: 'Penalties',
      resources: 'Additional Resources'
    };

    const fieldPlaceholders = {
      exercises: 'List specific exercises and activities...',
      instructions: 'Provide detailed instructions...',
      completionTime: 'e.g., 15-20 minutes',
      materialsNeeded: 'List required materials...',
      learningObjectives: 'What should clients learn from this resource?',
      keyConcepts: 'Main concepts and ideas...',
      additionalReading: 'Recommended books, articles, websites...',
      discussionQuestions: 'Questions for discussion or reflection...',
      resourceType: 'e.g., Support Group, Helpline, Service',
      location: 'Physical location or service area...',
      contactInfo: 'Phone, email, website...',
      availability: 'Hours, days, or appointment requirements...',
      eligibility: 'Who can access this resource?',
      cost: 'Free, sliding scale, insurance accepted...',
      crisisType: 'e.g., Suicide, Domestic Violence, Substance Abuse',
      urgencyLevel: 'Low, Medium, High, Critical',
      safetyPlan: 'Specific safety planning steps...',
      followUpSteps: 'What happens after initial contact?',
      warningSigns: 'Signs to watch for...',
      assessmentType: 'e.g., Screening, Diagnostic, Outcome',
      scoringMethod: 'How is this assessment scored?',
      interpretation: 'How to interpret results...',
      validityInfo: 'Reliability and validity information...',
      ageRange: 'e.g., 18-65, Children 6-12',
      protocolType: 'e.g., CBT, DBT, EMDR',
      evidenceBase: 'Research supporting this protocol...',
      sessionCount: 'Number of recommended sessions',
      outcomeMeasures: 'How progress is measured...',
      contraindications: 'When not to use this protocol...',
      researchType: 'e.g., Meta-analysis, RCT, Case Study',
      authors: 'Author names and affiliations...',
      publicationDate: 'Date of publication...',
      journal: 'Journal or publication name...',
      doi: 'Digital Object Identifier...',
      abstract: 'Brief summary of the research...',
      keyFindings: 'Main findings and implications...',
      trainingLevel: 'e.g., Beginner, Intermediate, Advanced',
      certification: 'Certification or credential required...',
      prerequisites: 'Required knowledge or experience...',
      learningOutcomes: 'What participants will learn...',
      ceuCredits: 'Number of continuing education credits...',
      videoLength: 'e.g., 45 minutes, 2 hours',
      instructor: 'Instructor name and credentials...',
      topics: 'Topics covered in the video...',
      skillLevel: 'Required skill level...',
      certificate: 'Is a certificate provided?',
      guidelineType: 'e.g., Clinical, Administrative, Ethical',
      organization: 'Issuing organization...',
      lastUpdated: 'When was this last updated?',
      complianceLevel: 'Required, Recommended, Optional',
      implementation: 'Steps to implement these guidelines...',
      monitoring: 'How to monitor compliance...',
      legalType: 'e.g., HIPAA, State Law, Professional Ethics',
      jurisdiction: 'Applicable geographic area...',
      effectiveDate: 'When this becomes effective...',
      complianceRequirements: 'What is required for compliance...',
      penalties: 'Consequences of non-compliance...',
      resources: 'Additional resources for compliance...'
    };

    return category.fields
      .filter(field => !['title', 'description', 'type', 'difficulty', 'duration', 'targetAudience', 'content', 'tags'].includes(field))
      .map(field => (
        <div key={field} className="form-group">
          <label>{fieldLabels[field] || field.charAt(0).toUpperCase() + field.slice(1)}</label>
          {field === 'urgencyLevel' || field === 'complianceLevel' || field === 'trainingLevel' || field === 'skillLevel' ? (
            <select
              value={resourceForm[field] || ''}
              onChange={(e) => setResourceForm(prev => ({ ...prev, [field]: e.target.value }))}
            >
              <option value="">Select {fieldLabels[field]}</option>
              {field === 'urgencyLevel' && (
                <>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </>
              )}
              {field === 'complianceLevel' && (
                <>
                  <option value="required">Required</option>
                  <option value="recommended">Recommended</option>
                  <option value="optional">Optional</option>
                </>
              )}
              {field === 'trainingLevel' && (
                <>
                  <option value="beginner">Beginner</option>
                  <option value="intermediate">Intermediate</option>
                  <option value="advanced">Advanced</option>
                </>
              )}
              {field === 'skillLevel' && (
                <>
                  <option value="basic">Basic</option>
                  <option value="intermediate">Intermediate</option>
                  <option value="advanced">Advanced</option>
                  <option value="expert">Expert</option>
                </>
              )}
            </select>
          ) : (
            <textarea
              value={resourceForm[field] || ''}
              onChange={(e) => setResourceForm(prev => ({ ...prev, [field]: e.target.value }))}
              placeholder={fieldPlaceholders[field] || `Enter ${field}...`}
              rows={3}
            />
          )}
        </div>
      ));
  };

  const filteredResources = resources.filter(resource => {
    const matchesSearch = resource.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         resource.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         resource.tags?.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesFilter = filterCategory === 'all' || resource.category === filterCategory;
    return matchesSearch && matchesFilter;
  });

  const getCategoryIcon = (category) => {
    const CategoryIcon = categories[category]?.icon || BookOpen;
    return <CategoryIcon size={20} />;
  };

  const getTypeIcon = (type) => {
    const TypeIcon = resourceTypes[type]?.icon || FileText;
    return <TypeIcon size={16} />;
  };

  // Check if current user can edit/delete resource
  const canEditResource = (resource) => {
    if (!currentUser) return false;
    // Check if user is admin or the creator of the resource
    // You'll need to add admin role checking logic here
    return resource.therapistId === currentUser.uid;
  };

  // Handle view resource
  const handleViewResource = (resource) => {
    if (resource.type === 'link' && resource.linkUrl) {
      window.open(resource.linkUrl, '_blank');
    } else if (resource.fileUrl) {
      window.open(resource.fileUrl, '_blank');
    } else {
      // Show content in a modal or new tab
      const contentWindow = window.open('', '_blank');
      contentWindow.document.write(`
        <html>
          <head><title>${resource.title}</title></head>
          <body>
            <h1>${resource.title}</h1>
            <p><strong>Description:</strong> ${resource.description}</p>
            <div><strong>Content:</strong></div>
            <div style="white-space: pre-wrap;">${resource.content || 'No content available'}</div>
          </body>
        </html>
      `);
    }
  };

  // Check if all required fields are filled
  const isWorksheetFormValid = () => {
    return worksheetForm.title.trim() !== '' &&
           worksheetForm.description.trim() !== '' &&
           worksheetForm.goal.trim() !== '' &&
           worksheetForm.instructions.trim() !== '' &&
           worksheetForm.category !== '' &&
           worksheetForm.type !== '' &&
           worksheetForm.status !== '' &&
           worksheetForm.fields.length > 0 &&
           worksheetForm.fields.every(field => field.name.trim() !== '' && field.type !== '');
  };

  // Handle worksheet creation
  const handleCreateWorksheet = async () => {
    try {
      const worksheetData = {
        ...worksheetForm,
        createdBy: currentUser.uid,
        dateCreated: serverTimestamp(),
        lastUpdated: serverTimestamp()
      };

      await addDoc(collection(db, 'worksheets'), worksheetData);
      setShowWorksheetModal(false);
      resetWorksheetForm();
      alert('Worksheet created successfully!');
    } catch (error) {
      console.error('Error creating worksheet:', error);
      alert('Error creating worksheet. Please try again.');
    }
  };

  // Reset worksheet form
  const resetWorksheetForm = () => {
    setWorksheetForm({
      title: '',
      description: '',
      goal: '',
      instructions: '',
      category: 'CBT',
      type: 'patient-facing',
      status: 'active',
      fields: [],
      allowMultipleResponses: true,
      assignedTo: []
    });
  };

  // Add worksheet field
  const addWorksheetField = () => {
    setWorksheetForm(prev => ({
      ...prev,
      fields: [...prev.fields, { name: '', type: 'text', required: true }]
    }));
  };

  // Remove worksheet field
  const removeWorksheetField = (index) => {
    setWorksheetForm(prev => ({
      ...prev,
      fields: prev.fields.filter((_, i) => i !== index)
    }));
  };

  // Update worksheet field
  const updateWorksheetField = (index, field, value) => {
    setWorksheetForm(prev => ({
      ...prev,
      fields: prev.fields.map((f, i) => 
        i === index ? { ...f, [field]: value } : f
      )
    }));
  };

  // Handle download resource as PDF
  const handleDownloadResource = (resource) => {
    if (resource.fileUrl) {
      // For file resources, download the original file
      const link = document.createElement('a');
      link.href = resource.fileUrl;
      link.download = resource.fileName || resource.title;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else if (resource.type === 'link' && resource.linkUrl) {
      window.open(resource.linkUrl, '_blank');
    } else {
      // Generate PDF with book-like styling
      generateResourcePDF(resource);
    }
  };

  // Generate PDF with book-like styling
  const generateResourcePDF = (resource) => {
    const pdf = new jsPDF();
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 20;
    const contentWidth = pageWidth - (margin * 2);
    let yPosition = margin;

    // Set font
    pdf.setFont('helvetica');

    // Title (Cover page style)
    pdf.setFontSize(24);
    pdf.setFont('helvetica', 'bold');
    pdf.text(resource.title, margin, yPosition + 20);
    yPosition += 40;

    // Subtitle/Description
    pdf.setFontSize(14);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(100, 100, 100);
    const descriptionLines = pdf.splitTextToSize(resource.description || '', contentWidth);
    pdf.text(descriptionLines, margin, yPosition);
    yPosition += descriptionLines.length * 6 + 20;

    // Resource Info Box
    pdf.setFillColor(248, 250, 252);
    pdf.rect(margin, yPosition, contentWidth, 40, 'F');
    pdf.setTextColor(0, 0, 0);
    pdf.setFontSize(10);
    
    // Category and Type
    pdf.text(`Category: ${categories[resource.category]?.name || resource.category}`, margin + 5, yPosition + 10);
    pdf.text(`Type: ${resourceTypes[resource.type]?.name || resource.type}`, margin + 5, yPosition + 18);
    
    // Duration and Difficulty
    if (resource.duration) {
      pdf.text(`Duration: ${resource.duration}`, margin + 5, yPosition + 26);
    }
    if (resource.difficulty) {
      pdf.text(`Difficulty: ${difficultyLevels[resource.difficulty] || resource.difficulty}`, margin + 5, yPosition + 34);
    }
    
    yPosition += 50;

    // Content Section
    if (resource.content) {
      pdf.setFontSize(16);
      pdf.setFont('helvetica', 'bold');
      pdf.text('Content', margin, yPosition);
      yPosition += 15;

      pdf.setFontSize(11);
      pdf.setFont('helvetica', 'normal');
      const contentLines = pdf.splitTextToSize(resource.content, contentWidth);
      
      contentLines.forEach((line, index) => {
        if (yPosition > pageHeight - 30) {
          pdf.addPage();
          yPosition = margin;
        }
        pdf.text(line, margin, yPosition);
        yPosition += 6;
      });
      yPosition += 20;
    }

    // Category-specific content
    const categoryFields = categories[resource.category]?.fields || [];
    categoryFields.forEach(field => {
      if (resource[field] && field !== 'title' && field !== 'description' && field !== 'content' && field !== 'type' && field !== 'category' && field !== 'tags' && field !== 'difficulty' && field !== 'duration' && field !== 'targetAudience' && field !== 'isPublic') {
        if (yPosition > pageHeight - 30) {
          pdf.addPage();
          yPosition = margin;
        }
        
        pdf.setFontSize(12);
        pdf.setFont('helvetica', 'bold');
        const fieldLabel = field.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
        pdf.text(fieldLabel + ':', margin, yPosition);
        yPosition += 8;

        pdf.setFontSize(10);
        pdf.setFont('helvetica', 'normal');
        const fieldLines = pdf.splitTextToSize(resource[field].toString(), contentWidth);
        fieldLines.forEach(line => {
          if (yPosition > pageHeight - 30) {
            pdf.addPage();
            yPosition = margin;
          }
          pdf.text(line, margin, yPosition);
          yPosition += 5;
        });
        yPosition += 10;
      }
    });

    // Tags
    if (resource.tags && resource.tags.length > 0) {
      if (yPosition > pageHeight - 30) {
        pdf.addPage();
        yPosition = margin;
      }
      
      pdf.setFontSize(12);
      pdf.setFont('helvetica', 'bold');
      pdf.text('Tags:', margin, yPosition);
      yPosition += 8;

      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'normal');
      pdf.text(resource.tags.join(', '), margin, yPosition);
      yPosition += 15;
    }

    // Footer
    const footerY = pageHeight - 20;
    pdf.setFontSize(8);
    pdf.setTextColor(150, 150, 150);
    pdf.text(`Created by: ${therapistNames[resource.therapistId] || resource.therapistName || 'Unknown'}`, margin, footerY);
    pdf.text(`Created: ${resource.createdAt?.toDate?.()?.toLocaleString() || 'Unknown'}`, pageWidth - margin - 60, footerY);

    // Download the PDF
    pdf.save(`${resource.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.pdf`);
  };

  return (
    <div className="resources-dashboard">
      <div className="resources-header">
        <div className="header-content">
          <h1 className="page-title">Resources & Training Library</h1>
          <p className="subtitle">Access comprehensive clinical resources, training materials, and professional development tools</p>
        </div>
        <div className="header-actions">
          <button 
            className="btn-secondary"
            onClick={() => setShowWorksheetModal(true)}
            style={{ marginRight: '1rem' }}
          >
            <FileText size={16} />
            Create Worksheet
          </button>
          <button 
            className="btn-primary"
            onClick={() => setShowCreateModal(true)}
          >
            <Plus size={16} />
            Add Resource
          </button>
        </div>
      </div>

      {/* Category Navigation - Hidden */}
      {/* <div className="category-nav">
        <div className="nav-tabs">
          {Object.entries(categories).map(([key, category]) => {
            const CategoryIcon = category.icon;
            return (
              <button
                key={key}
                className={`nav-tab ${activeTab === key ? 'active' : ''}`}
                onClick={() => setActiveTab(key)}
              >
                <CategoryIcon size={20} />
                <span>{category.name}</span>
              </button>
            );
          })}
        </div>
      </div> */}

      {/* Search and Filters */}
      <div className="resources-controls">
        <div className="search-section">
          <div className="search-input">
            <Search size={20} />
            <input
              type="text"
              placeholder="Search resources by title, description, or tags..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
        <div className="filter-section">
          <Filter size={16} />
          <select 
            value={filterCategory} 
            onChange={(e) => setFilterCategory(e.target.value)}
          >
            <option value="all">All Categories</option>
            {Object.entries(categories).map(([key, category]) => (
              <option key={key} value={key}>{category.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Resources Grid */}
      <div className="resources-grid">
        {filteredResources.map((resource) => (
          <div key={resource.id} className="resource-card">
            <div className="resource-header">
              <div className="resource-icon">
                {getCategoryIcon(resource.category)}
              </div>
              <div className="resource-type">
                {getTypeIcon(resource.type)}
                <span>{resourceTypes[resource.type]?.name || 'Document'}</span>
              </div>
            </div>
            
            <div className="resource-content">
              <h3 className="resource-title">{resource.title}</h3>
              <p className="resource-description">{resource.description}</p>
              
              <div className="resource-meta">
                <div className="meta-item">
                  <Clock size={14} />
                  <span>{resource.duration || 'N/A'}</span>
                </div>
                <div className="meta-item">
                  <Tag size={14} />
                  <span>{difficultyLevels[resource.difficulty] || 'Beginner'}</span>
                </div>
                <div className="meta-item">
                  <Users size={14} />
                  <span>{targetAudiences[resource.targetAudience] || 'All Clients'}</span>
                </div>
              </div>

              {resource.tags && resource.tags.length > 0 && (
                <div className="resource-tags">
                  {resource.tags.slice(0, 3).map((tag, index) => (
                    <span key={index} className="tag">{tag}</span>
                  ))}
                  {resource.tags.length > 3 && (
                    <span className="tag-more">+{resource.tags.length - 3}</span>
                  )}
                </div>
              )}
              
              <div className="resource-creator">
                <span className="creator-label">Created by:</span>
                <span className="creator-name">{therapistNames[resource.therapistId] || resource.therapistName || 'Unknown'}</span>
              </div>
            </div>

            <div className="resource-actions">
              <button 
                className="btn-icon"
                onClick={() => handleViewResource(resource)}
                title="View Resource"
              >
                <Eye size={16} />
              </button>
              <button 
                className="btn-icon"
                onClick={() => openEditModal(resource)}
                title="Edit Resource"
                disabled={!canEditResource(resource)}
              >
                <Edit size={16} />
              </button>
              <button 
                className="btn-icon"
                onClick={() => handleDownloadResource(resource)}
                title="Download Resource"
              >
                <Download size={16} />
              </button>
              <button 
                className="btn-icon danger"
                onClick={() => handleDeleteResource(resource.id)}
                title="Delete Resource"
                disabled={!canEditResource(resource)}
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Create/Edit Resource Modal */}
      {(showCreateModal || showEditModal) && (
        <div className="modal-overlay" onClick={() => {
          setShowCreateModal(false);
          setShowEditModal(false);
          setSelectedResource(null);
          resetForm();
        }}>
          <div className="modal-content large" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{showCreateModal ? 'Add New Resource' : 'Edit Resource'}</h2>
              <button 
                className="close-button"
                onClick={() => {
                  setShowCreateModal(false);
                  setShowEditModal(false);
                  setSelectedResource(null);
                  resetForm();
                }}
              >
                ×
              </button>
            </div>
            
            <div className="modal-body">
              <div className="resource-form">
                <div className="form-row">
                  <div className="form-group">
                    <label>Title</label>
                    <input
                      type="text"
                      value={resourceForm.title}
                      onChange={(e) => setResourceForm(prev => ({ ...prev, title: e.target.value }))}
                      placeholder="Enter resource title"
                    />
                  </div>
                  <div className="form-group">
                    <label>Category</label>
                    <select
                      value={resourceForm.category}
                      onChange={(e) => setResourceForm(prev => ({ ...prev, category: e.target.value }))}
                    >
                      {Object.entries(categories).map(([key, category]) => (
                        <option key={key} value={key}>{category.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="form-group">
                  <label>Description</label>
                  <textarea
                    value={resourceForm.description}
                    onChange={(e) => setResourceForm(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="Describe the resource and its purpose"
                    rows={3}
                  />
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Type</label>
                    <select
                      value={resourceForm.type}
                      onChange={(e) => setResourceForm(prev => ({ ...prev, type: e.target.value }))}
                    >
                      {Object.entries(resourceTypes).map(([key, type]) => (
                        <option key={key} value={key}>{type.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Difficulty Level</label>
                    <select
                      value={resourceForm.difficulty}
                      onChange={(e) => setResourceForm(prev => ({ ...prev, difficulty: e.target.value }))}
                    >
                      {Object.entries(difficultyLevels).map(([key, level]) => (
                        <option key={key} value={key}>{level}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Duration</label>
                    <input
                      type="text"
                      value={resourceForm.duration}
                      onChange={(e) => setResourceForm(prev => ({ ...prev, duration: e.target.value }))}
                      placeholder="e.g., 30 minutes, 1 hour"
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label>Target Audience Type</label>
                  <select
                    value={resourceForm.targetAudienceType || 'clients'}
                    onChange={(e) => setResourceForm(prev => ({ ...prev, targetAudienceType: e.target.value, targetAudience: 'all' }))}
                  >
                    {Object.entries(targetAudienceTypes).map(([key, type]) => (
                      <option key={key} value={key}>{type}</option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label>Target Audience</label>
                  <select
                    value={resourceForm.targetAudience}
                    onChange={(e) => setResourceForm(prev => ({ ...prev, targetAudience: e.target.value }))}
                  >
                    {resourceForm.targetAudienceType === 'therapists' ? (
                      Object.entries(therapistAudienceOptions).map(([key, audience]) => (
                      <option key={key} value={key}>{audience}</option>
                      ))
                    ) : (
                      Object.entries(targetAudiences).map(([key, audience]) => (
                        <option key={key} value={key}>{audience}</option>
                      ))
                    )}
                  </select>
                </div>

                {/* File Upload Section for Video, Audio, Image */}
                {(resourceForm.type === 'video' || resourceForm.type === 'audio' || resourceForm.type === 'image') && (
                  <div className="form-group">
                    <label>Upload {resourceForm.type.charAt(0).toUpperCase() + resourceForm.type.slice(1)} File</label>
                    <div className="file-upload-section">
                      <input
                        type="file"
                        accept={resourceForm.type === 'video' ? 'video/*' : resourceForm.type === 'audio' ? 'audio/*' : 'image/*'}
                        onChange={(e) => {
                          const file = e.target.files[0];
                          if (file) {
                            handleFileUpload(file);
                          }
                        }}
                        style={{ display: 'none' }}
                        id="file-upload"
                      />
                      <label htmlFor="file-upload" className="btn-secondary">
                        <Upload size={16} />
                        Choose {resourceForm.type.charAt(0).toUpperCase() + resourceForm.type.slice(1)} File
                      </label>
                      {selectedFile && (
                        <div className="file-preview">
                          <span className="file-selected">
                            Selected: {selectedFile.name} ({(selectedFile.size / 1024 / 1024).toFixed(2)} MB)
                          </span>
                          {resourceForm.type === 'image' && filePreview && (
                            <img src={filePreview} alt="Preview" className="image-preview" />
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Link URL Section for Link type */}
                {resourceForm.type === 'link' && (
                  <div className="form-group">
                    <label>Link URL</label>
                    <input
                      type="url"
                      value={resourceForm.linkUrl}
                      onChange={(e) => setResourceForm(prev => ({ ...prev, linkUrl: e.target.value }))}
                      placeholder="https://example.com"
                    />
                  </div>
                )}

                {/* Client Selection for Specific Sharing */}
                {resourceForm.targetAudience === 'specific' && (
                  <div className="form-group">
                    <label>Select Specific Clients</label>
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => setShowClientSelection(true)}
                    >
                      <Users size={16} />
                      Choose {resourceForm.targetAudienceType === 'therapists' ? 'Therapists' : 'Clients'} ({resourceForm.targetAudienceType === 'therapists' ? selectedTherapists.length : selectedClients.length} selected)
                    </button>
                    {(resourceForm.targetAudienceType === 'therapists' ? selectedTherapists.length : selectedClients.length) > 0 && (
                      <div className="selected-clients">
                        <h4>Selected {resourceForm.targetAudienceType === 'therapists' ? 'Therapists' : 'Clients'}:</h4>
                        <div className="client-tags">
                          {resourceForm.targetAudienceType === 'therapists' ? (
                            selectedTherapists.map(therapist => (
                              <span key={therapist.id} className="client-tag">
                                {therapist.name || therapist.displayName || therapist.email}
                                <button
                                  type="button"
                                  onClick={() => handleTherapistSelection(therapist.id)}
                                  className="remove-client"
                                >
                                  ×
                                </button>
                              </span>
                            ))
                          ) : (
                            selectedClients.map(clientId => {
                            const client = [...assignedClients, ...allClients].find(c => c.id === clientId);
                            return (
                              <span key={clientId} className="client-tag">
                                {client?.displayName || client?.clientName || client?.name || client?.email || 'Unknown Client'}
                                <button
                                  type="button"
                                  onClick={() => handleClientSelection(clientId)}
                                  className="remove-client"
                                >
                                  ×
                                </button>
                              </span>
                            );
                            })
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <div className="form-group">
                  <label>Content</label>
                  <textarea
                    value={resourceForm.content}
                    onChange={(e) => setResourceForm(prev => ({ ...prev, content: e.target.value }))}
                    placeholder="Enter the main content, instructions, or description of the resource"
                    rows={6}
                  />
                </div>

                <div className="form-group">
                  <label>Tags (comma-separated)</label>
                  <input
                    type="text"
                    value={resourceForm.tags.join(', ')}
                    onChange={(e) => setResourceForm(prev => ({ 
                      ...prev, 
                      tags: e.target.value.split(',').map(tag => tag.trim()).filter(Boolean)
                    }))}
                    placeholder="anxiety, CBT, mindfulness, etc."
                  />
                </div>

                {/* Category-specific fields */}
                <div className="category-specific-fields">
                  <h4>{categories[resourceForm.category]?.name} Specific Fields</h4>
                  {renderCategoryFields()}
                </div>

                <div className="form-group checkbox-group">
                  <label>
                    <input
                      type="checkbox"
                      checked={resourceForm.isPublic}
                      onChange={(e) => setResourceForm(prev => ({ ...prev, isPublic: e.target.checked }))}
                    />
                    Make this resource public (visible to other therapists)
                  </label>
                </div>
              </div>
            </div>

            <div className="modal-footer">
              <button 
                className="btn-secondary"
                onClick={() => {
                  setShowCreateModal(false);
                  setShowEditModal(false);
                  setSelectedResource(null);
                  resetForm();
                }}
              >
                Cancel
              </button>
              <button 
                className="btn-primary"
                onClick={showCreateModal ? handleCreateResource : handleUpdateResource}
              >
                {showCreateModal ? 'Create Resource' : 'Update Resource'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Client Selection Modal */}
      {showClientSelection && (
        <div className="modal-overlay client-selection-overlay" onClick={() => setShowClientSelection(false)}>
          <div className="modal-content large client-selection-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>
                {resourceForm.targetAudienceType === 'therapists' ? 'Select Therapists' : 'Select Clients'}
              </h2>
              <button className="close-button" onClick={() => setShowClientSelection(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="client-selection">
                {resourceForm.targetAudienceType === 'therapists' ? (
                  // Therapist Selection
                  <div className="client-section">
                    <h3>Available Therapists</h3>
                    <div className="client-list">
                      {allTherapists.filter(therapist => therapist.id !== currentUser?.uid).map(therapist => (
                        <div key={therapist.id} className="client-item">
                          <label>
                            <input
                              type="checkbox"
                              checked={selectedTherapists.some(t => t.id === therapist.id)}
                              onChange={() => handleTherapistSelection(therapist.id)}
                            />
                            <div className="client-info">
                              <span className="client-name">{therapist.name || therapist.displayName || therapist.email}</span>
                              <span className="client-email">{therapist.email}</span>
                            </div>
                          </label>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  // Client Selection
                  <>
                {/* Assigned Clients Section */}
                <div className="client-section">
                  <h3>Your Assigned Clients</h3>
                  <div className="client-list">
                    {assignedClients.map(client => (
                      <div key={client.id} className="client-item">
                        <label>
                          <input
                            type="checkbox"
                            checked={selectedClients.includes(client.id)}
                            onChange={() => handleClientSelection(client.id)}
                          />
                          <div className="client-info">
                            <span className="client-name">{client?.displayName || client?.clientName || client?.name || client?.email || 'Unknown'}</span>
                            <span className="client-email">{client.email}</span>
                          </div>
                        </label>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Other Clients Section */}
                <div className="client-section">
                  <h3>Other Clients</h3>
                  <div className="client-list">
                    {allClients.filter(client => !assignedClients.find(ac => ac.id === client.id)).map(client => (
                      <div key={client.id} className="client-item">
                        <label>
                          <input
                            type="checkbox"
                            checked={selectedClients.includes(client.id)}
                            onChange={() => handleClientSelection(client.id)}
                          />
                          <div className="client-info">
                            <span className="client-name">{client?.displayName || client?.clientName || client?.name || client?.email || 'Unknown'}</span>
                            <span className="client-email">{client.email}</span>
                          </div>
                        </label>
                      </div>
                    ))}
                  </div>
                </div>
                  </>
                )}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setShowClientSelection(false)}>
                Cancel
              </button>
              <button className="btn-primary" onClick={handleSaveClientSelection}>
                Save Selection ({resourceForm.targetAudienceType === 'therapists' ? selectedTherapists.length : selectedClients.length} {resourceForm.targetAudienceType === 'therapists' ? 'therapists' : 'clients'})
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Worksheet Modal */}
      {showWorksheetModal && (
        <div className="modal-overlay" onClick={() => setShowWorksheetModal(false)}>
          <div className="modal-content large" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Create Worksheet</h2>
              <button className="close-button" onClick={() => setShowWorksheetModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="form-section">
                <h3>Basic Information</h3>
                <div className="form-grid">
                  <div className="form-group">
                    <label>Title *</label>
                    <input
                      type="text"
                      value={worksheetForm.title}
                      onChange={(e) => setWorksheetForm(prev => ({ ...prev, title: e.target.value }))}
                      placeholder="e.g., CBT Thought Record"
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Category *</label>
                    <select
                      value={worksheetForm.category}
                      onChange={(e) => setWorksheetForm(prev => ({ ...prev, category: e.target.value }))}
                    >
                      {Object.entries(worksheetCategories).map(([key, category]) => (
                        <option key={key} value={key}>{category}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Type *</label>
                    <select
                      value={worksheetForm.type}
                      onChange={(e) => setWorksheetForm(prev => ({ ...prev, type: e.target.value }))}
                    >
                      {Object.entries(worksheetTypes).map(([key, type]) => (
                        <option key={key} value={key}>{type}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Status *</label>
                    <select
                      value={worksheetForm.status}
                      onChange={(e) => setWorksheetForm(prev => ({ ...prev, status: e.target.value }))}
                    >
                      {Object.entries(worksheetStatuses).map(([key, status]) => (
                        <option key={key} value={key}>{status}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="form-group full-width">
                  <label>Description *</label>
                  <textarea
                    value={worksheetForm.description}
                    onChange={(e) => setWorksheetForm(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="Brief description of the worksheet purpose..."
                    rows="3"
                    required
                  />
                </div>

                <div className="form-group full-width">
                  <label>Goal *</label>
                  <textarea
                    value={worksheetForm.goal}
                    onChange={(e) => setWorksheetForm(prev => ({ ...prev, goal: e.target.value }))}
                    placeholder="What should clients achieve with this worksheet?"
                    rows="2"
                    required
                  />
                </div>

                <div className="form-group full-width">
                  <label>Instructions *</label>
                  <textarea
                    value={worksheetForm.instructions}
                    onChange={(e) => setWorksheetForm(prev => ({ ...prev, instructions: e.target.value }))}
                    placeholder="Step-by-step instructions for completing the worksheet..."
                    rows="4"
                    required
                  />
                </div>
              </div>

              <div className="form-section">
                <h3>Worksheet Fields</h3>
                <p>Define the fields that clients will fill out in this worksheet.</p>
                
                {worksheetForm.fields.map((field, index) => (
                  <div key={index} className="field-config">
                    <div className="form-grid">
                      <div className="form-group">
                        <label>Field Name *</label>
                        <input
                          type="text"
                          value={field.name}
                          onChange={(e) => updateWorksheetField(index, 'name', e.target.value)}
                          placeholder="e.g., situation, automaticThoughts"
                          required
                        />
                      </div>
                      <div className="form-group">
                        <label>Field Type *</label>
                        <select
                          value={field.type}
                          onChange={(e) => updateWorksheetField(index, 'type', e.target.value)}
                        >
                          <option value="text">Text</option>
                          <option value="textarea">Long Text</option>
                          <option value="number">Number</option>
                          <option value="date">Date</option>
                          <option value="select">Dropdown</option>
                          <option value="checkbox">Checkbox</option>
                          <option value="radio">Radio Buttons</option>
                        </select>
                      </div>
                      <div className="form-group">
                        <label>
                          <input
                            type="checkbox"
                            checked={field.required}
                            onChange={(e) => updateWorksheetField(index, 'required', e.target.checked)}
                          />
                          Required Field
                        </label>
                      </div>
                      <div className="form-group">
                        <button
                          type="button"
                          className="btn-danger small"
                          onClick={() => removeWorksheetField(index)}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  </div>
                ))}

                <button
                  type="button"
                  className="btn-secondary"
                  onClick={addWorksheetField}
                >
                  <Plus size={16} />
                  Add Field
                </button>
              </div>

              <div className="form-section">
                <h3>Assignment Settings</h3>
                <div className="form-group">
                  <label>
                    <input
                      type="checkbox"
                      checked={worksheetForm.allowMultipleResponses}
                      onChange={(e) => setWorksheetForm(prev => ({ ...prev, allowMultipleResponses: e.target.checked }))}
                    />
                    Allow Multiple Responses (clients can submit multiple times)
                  </label>
                </div>

                <div className="form-group">
                  <label>Assign to Clients</label>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => setShowClientSelection(true)}
                  >
                    <Users size={16} />
                    Select Clients
                  </button>
                  {worksheetForm.assignedTo.length > 0 && (
                    <div className="selected-clients">
                      <p>Assigned to {worksheetForm.assignedTo.length} client(s)</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button 
                className="btn-secondary"
                onClick={() => setShowWorksheetModal(false)}
              >
                Cancel
              </button>
              <button 
                className={`btn-primary ${!isWorksheetFormValid() ? 'disabled' : ''}`}
                onClick={handleCreateWorksheet}
                disabled={!isWorksheetFormValid()}
              >
                Create Worksheet
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
